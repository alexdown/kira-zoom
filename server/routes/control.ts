import { Router, type Request, type Response } from "express";
import type { Config } from "../config.js";
import { DEFAULT_RAISE_HAND_MESSAGE, DEFAULT_PERSONALITY } from "../config.js";
import type { SessionManager } from "../services/session-manager.js";
import type { RecallService } from "../services/recall.js";
import type { SpeakerService } from "../services/speaker.js";
import type { LLMService } from "../services/llm.js";
import { SessionState } from "../types.js";
import type { SpeakRequest, SendChatRequest } from "../types.js";

export function createControlRouter(
  config: Config,
  sessionManager: SessionManager,
  recall: RecallService,
  speaker: SpeakerService,
  llm: LLMService,
  broadcast: (sessionId: string, message: unknown) => void,
): Router {
  const router = Router();

  // Helper: get session + validate bot exists
  function getSessionWithBot(id: string) {
    const session = sessionManager.getSession(id);
    if (!session.botId) {
      throw Object.assign(new Error("Session has no active bot"), {
        statusCode: 400,
      });
    }
    return session;
  }

  // ── POST /:id/raise-hand ─────────────────────

  router.post("/:id/raise-hand", async (req: Request, res: Response) => {
    try {
      const session = getSessionWithBot(req.params.id as string);

      // Send chat message to meeting
      const message = DEFAULT_RAISE_HAND_MESSAGE;
      await recall.sendChatMessage(session.botId!, message);

      // Update state
      sessionManager.updateState(session.id, SessionState.HAND_RAISED);

      // Broadcast state change via WS
      broadcast(session.id, {
        type: "state_change",
        state: SessionState.HAND_RAISED,
      });

      // Pre-generate TTS for top question in background
      const topQuestion = session.questions.find(
        (q) => q.status === "ready",
      );
      if (topQuestion) {
        const personality = session.config.personality ?? DEFAULT_PERSONALITY;
        const introPhrase = personality.introPhrase ?? DEFAULT_PERSONALITY.introPhrase;
        const fullText = `${introPhrase} ${topQuestion.text}`;

        // Fire-and-forget TTS pre-generation
        speaker.generateSpeech(fullText, session.config.ttsVoice).then(
          () =>
            console.log(
              `[Control] ${session.id}: pre-generated TTS for question ${topQuestion.id}`,
            ),
          (err) =>
            console.warn(
              `[Control] ${session.id}: TTS pre-gen failed:`,
              (err as Error).message,
            ),
        );
      }

      console.log(`[Control] ${session.id}: hand raised`);

      res.json({
        state: session.state,
        message: "Hand raised",
        topQuestion: topQuestion?.text ?? null,
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ error: msg });
      } else {
        res.status(statusCode).json({ error: msg });
      }
    }
  });

  // ── POST /:id/speak ──────────────────────────

  router.post("/:id/speak", async (req: Request, res: Response) => {
    try {
      const session = getSessionWithBot(req.params.id as string);
      const body = req.body as SpeakRequest;

      let textToSpeak: string;

      if (body.text) {
        // Explicit text provided
        textToSpeak = body.text;
      } else {
        // Use a question — find by ID or pick the top ready one
        const question = body.questionId
          ? session.questions.find((q) => q.id === body.questionId)
          : session.questions.find((q) => q.status === "ready");

        if (!question) {
          res.status(400).json({
            error: "No text provided and no ready questions available",
          });
          return;
        }

        // Optionally refine the question based on transcript
        let questionText = question.text;
        if (body.refineFromTranscript && session.transcript.length > 0) {
          const recentTranscript = session.transcript
            .slice(-20)
            .map((s) => `${s.speaker}: ${s.text}`)
            .join("\n");
          questionText = await llm.refineQuestion(
            question.text,
            recentTranscript,
            session.config.systemPrompt,
            session.config.personality,
          );
        }

        const personality = session.config.personality ?? DEFAULT_PERSONALITY;
        const introPhrase = personality.introPhrase ?? DEFAULT_PERSONALITY.introPhrase;
        textToSpeak = `${introPhrase} ${questionText}`;

        // Mark question as asked
        question.status = "asked";
      }

      // Update state to SPEAKING
      sessionManager.updateState(session.id, SessionState.SPEAKING);
      broadcast(session.id, {
        type: "state_change",
        state: SessionState.SPEAKING,
      });

      // Speak in meeting
      const result = await speaker.speakInMeeting(
        session.botId!,
        textToSpeak,
        session.config.ttsVoice,
      );

      console.log(
        `[Control] ${session.id}: spoke (${result.audioDurationMs}ms) — "${textToSpeak.slice(0, 80)}..."`,
      );

      // Return to LISTENING after speech
      // Wait for estimated audio duration before transitioning
      setTimeout(() => {
        try {
          sessionManager.updateState(session.id, SessionState.LISTENING);
          broadcast(session.id, {
            type: "state_change",
            state: SessionState.LISTENING,
          });
        } catch {
          // Session may have been deleted
        }
      }, result.audioDurationMs + 500);

      res.json({
        state: session.state,
        text: textToSpeak,
        audioDurationMs: result.audioDurationMs,
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ error: msg });
      } else if (msg.includes("Invalid state transition")) {
        res.status(409).json({ error: msg });
      } else {
        res.status(statusCode).json({ error: msg });
      }
    }
  });

  // ── POST /:id/lower-hand ─────────────────────

  router.post("/:id/lower-hand", async (req: Request, res: Response) => {
    try {
      const session = getSessionWithBot(req.params.id as string);

      sessionManager.updateState(session.id, SessionState.LISTENING);

      broadcast(session.id, {
        type: "state_change",
        state: SessionState.LISTENING,
      });

      console.log(`[Control] ${session.id}: hand lowered`);

      res.json({ state: session.state, message: "Hand lowered" });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ error: msg });
      } else if (msg.includes("Invalid state transition")) {
        res.status(409).json({ error: msg });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  // ── POST /:id/send-chat ──────────────────────

  router.post("/:id/send-chat", async (req: Request, res: Response) => {
    try {
      const session = getSessionWithBot(req.params.id as string);
      const body = req.body as SendChatRequest;

      if (!body.message) {
        res.status(400).json({ error: "message is required" });
        return;
      }

      await recall.sendChatMessage(session.botId!, body.message);

      console.log(
        `[Control] ${session.id}: sent chat — "${body.message.slice(0, 60)}"`,
      );

      res.json({ sent: true, message: body.message });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ error: msg });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  // ── POST /:id/leave ──────────────────────────

  router.post("/:id/leave", async (req: Request, res: Response) => {
    try {
      const session = getSessionWithBot(req.params.id as string);

      // Leave the meeting
      try {
        await recall.leaveMeeting(session.botId!);
      } catch (err) {
        console.warn(
          `[Control] ${session.id}: leave failed (may already have left):`,
          (err as Error).message,
        );
      }

      // Transition state
      sessionManager.updateState(session.id, SessionState.LEAVING);
      broadcast(session.id, {
        type: "state_change",
        state: SessionState.LEAVING,
      });

      sessionManager.updateState(session.id, SessionState.DONE);
      broadcast(session.id, {
        type: "state_change",
        state: SessionState.DONE,
      });

      console.log(`[Control] ${session.id}: left meeting`);

      res.json({ state: session.state, message: "Left meeting" });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ error: msg });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  return router;
}
