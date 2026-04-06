import { Router, type Request, type Response } from "express";
import type { Config } from "../config.js";
import { DEFAULT_RAISE_HAND_MESSAGE, DEFAULT_PERSONALITY } from "../config.js";
import type { SessionManager } from "../services/session-manager.js";
import type { RecallService } from "../services/recall.js";
import type { SpeakerService } from "../services/speaker.js";
import type { LLMService } from "../services/llm.js";
import { SessionState } from "../types.js";
import type { SpeakRequest, SendChatRequest, TranscriptSegment } from "../types.js";

export function createControlRouter(
  config: Config,
  sessionManager: SessionManager,
  recall: RecallService,
  speaker: SpeakerService,
  llm: LLMService,
  broadcast: (sessionId: string, message: unknown) => void,
  sendAvatarCommand?: (command: { type: string; text?: string; mode?: string }) => void,
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

  // ── POST /:id/inject-context ──────────────────

  router.post("/:id/inject-context", async (req: Request, res: Response) => {
    try {
      const session = sessionManager.getSession(req.params.id as string);
      const { text, label } = req.body as { text?: string; label?: string };

      if (!text || !text.trim()) {
        res.status(400).json({ error: "text is required" });
        return;
      }

      // Prefix with context-absorption instructions
      const prefixedText = `CONTEXT UPDATE (do not respond to this verbally — silently absorb this information and use it to inform your future responses): ${text}`;

      // Send to avatar via the avatar-commands WebSocket
      if (sendAvatarCommand) {
        sendAvatarCommand({ type: "inject-context", text: prefixedText });
      }

      // Log the injection in the session transcript as a system message
      const segment: TranscriptSegment = {
        speaker: "[SYSTEM]",
        text: `Context injected${label ? ` (${label})` : ""}: ${text.slice(0, 100)}${text.length > 100 ? "…" : ""}`,
        timestamp: Date.now(),
      };
      session.transcript.push(segment);

      // Broadcast to dashboard clients
      broadcast(session.id, {
        type: "transcript",
        speaker: segment.speaker,
        text: segment.text,
        timestamp: segment.timestamp,
      });

      const preview = text.slice(0, 120) + (text.length > 120 ? "…" : "");

      console.log(
        `[Control] ${session.id}: context injected${label ? ` [${label}]` : ""} — "${preview}"`,
      );

      res.json({ status: "injected", text: preview });
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
