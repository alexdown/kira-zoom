import { Router, type Request, type Response } from "express";
import type { Config } from "../config.js";
import type { SessionManager } from "../services/session-manager.js";
import type { RecallService } from "../services/recall.js";
import type { LLMService } from "../services/llm.js";
import { SessionState } from "../types.js";
import type { CreateSessionRequest } from "../types.js";

export function createSessionsRouter(
  config: Config,
  sessionManager: SessionManager,
  recall: RecallService,
  llm: LLMService,
): Router {
  const router = Router();

  // ── POST / — Create a new session ────────────

  router.post("/", async (req: Request, res: Response) => {
    try {
      const body = req.body as CreateSessionRequest;

      if (!body.meetingUrl) {
        res.status(400).json({ error: "meetingUrl is required" });
        return;
      }

      const botName = body.botName ?? config.defaultBotName;
      const sessionConfig = body.config ?? {};

      // 1. Create session in memory
      const session = sessionManager.createSession(
        body.meetingUrl,
        botName,
        sessionConfig,
      );

      console.log(`[Session] Created ${session.id} for ${body.meetingUrl}`);

      // 2. If paper text provided, analyze it
      if (body.paperText) {
        try {
          sessionManager.updateState(session.id, SessionState.PREPARING);

          const personality = sessionConfig.personality;
          const systemPrompt = sessionConfig.systemPrompt;

          const analysis = await llm.analyzePaper(
            body.paperText,
            systemPrompt,
            personality,
          );

          session.paper = {
            summary: analysis.summary,
            rawText: body.paperText,
          };
          session.questions = analysis.questions;

          console.log(
            `[Session] ${session.id}: analyzed paper, generated ${analysis.questions.length} questions`,
          );
        } catch (err) {
          console.error(
            `[Session] ${session.id}: paper analysis failed:`,
            (err as Error).message,
          );
          // Continue without paper — don't fail the whole session
        }
      }

      // 3. Create bot via Recall.ai and join the meeting
      try {
        const state = session.state === SessionState.PREPARING
          ? session.state
          : SessionState.IDLE;
        if (state !== SessionState.PREPARING) {
          // If we didn't prepare (no paper), go straight to JOINING
        }
        sessionManager.updateState(session.id, SessionState.JOINING);

        const avatarUrl = `${config.avatarPublicUrl}?sessionId=${session.id}`;
        const botResult = await recall.createBot(
          body.meetingUrl,
          botName,
          avatarUrl,
          config.webhookBaseUrl,
        );

        session.botId = botResult.id as string;

        console.log(
          `[Session] ${session.id}: bot created (botId=${session.botId})`,
        );
      } catch (err) {
        console.error(
          `[Session] ${session.id}: bot creation failed:`,
          (err as Error).message,
        );
        res.status(502).json({
          error: `Failed to create bot: ${(err as Error).message}`,
          session,
        });
        return;
      }

      res.status(201).json(session);
    } catch (err) {
      console.error("[Session] Create error:", (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── GET / — List all sessions ────────────────

  router.get("/", (_req: Request, res: Response) => {
    try {
      const sessions = sessionManager.listSessions();
      res.json(sessions);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── GET /:id — Get a single session ──────────

  router.get("/:id", (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const session = sessionManager.getSession(id);
      res.json(session);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ error: msg });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  // ── DELETE /:id — End a session ──────────────

  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const session = sessionManager.getSession(id);

      // Leave the meeting if bot is active
      if (session.botId) {
        try {
          await recall.leaveMeeting(session.botId);
          console.log(
            `[Session] ${session.id}: bot left meeting`,
          );
        } catch (err) {
          console.warn(
            `[Session] ${session.id}: bot leave failed (may already have left):`,
            (err as Error).message,
          );
        }
      }

      // Try to transition to LEAVING → DONE
      try {
        sessionManager.updateState(session.id, SessionState.LEAVING);
        sessionManager.updateState(session.id, SessionState.DONE);
      } catch {
        // State transition may fail if already DONE — that's fine
      }

      sessionManager.deleteSession(session.id);

      res.status(204).send();
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
