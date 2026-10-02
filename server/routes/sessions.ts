import { Router, type Request, type Response } from "express";
import type { Config } from "../config.js";
import { DEFAULT_SYSTEM_PROMPT } from "../config.js";
import type { SessionManager } from "../services/session-manager.js";
import type { RecallService } from "../services/recall.js";
import { detectPlatform } from "../services/platform.js";
import type { LLMService } from "../services/llm.js";
import { SessionState } from "../types.js";
import type { CreateSessionRequest } from "../types.js";

/**
 * Build the combined HeyGen context prompt from session data.
 */
function buildHeygenContextPrompt(
  basePrompt: string,
  paper?: { summary: string; rawText?: string },
  comments?: Array<{ author: string; comment: string; anchored_text: string }>,
  questions?: Array<{ text: string; rationale: string }>,
): string {
  const parts: string[] = [basePrompt];

  if (paper?.summary) {
    parts.push(`DOCUMENT SUMMARY:\n${paper.summary}`);
  }

  if (comments && comments.length > 0) {
    const commentLines = comments.map((c) => {
      const anchor = c.anchored_text
        ? ` on "${c.anchored_text.slice(0, 80)}"`
        : "";
      return `- [${c.author}]${anchor}: "${c.comment}"`;
    });
    parts.push(
      `DOCUMENT COMMENTS (${comments.length} comments from reviewers):\n${commentLines.join("\n")}`,
    );
  }

  if (questions && questions.length > 0) {
    const qLines = questions.map(
      (q, i) => `${i + 1}. ${q.text} — Rationale: ${q.rationale}`,
    );
    parts.push(
      `YOUR PREPARED QUESTIONS (ask when appropriate, but adapt based on conversation):\n${qLines.join("\n")}`,
    );
  }

  parts.push(
    "BEHAVIOR: Listen actively. When someone answers, engage with follow-ups based on what they said. Don't just read scripted questions. Be conversational and genuinely curious.",
  );

  return parts.join("\n\n");
}

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

      const platform = detectPlatform(body.meetingUrl);
      console.log(`[Session] Detected platform: ${platform}`);

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

      // If pre-analyzed questions were provided, use them
      if (body.questions && body.questions.length > 0 && session.questions.length === 0) {
        session.questions = body.questions;
        console.log(
          `[Session] ${session.id}: using ${body.questions.length} pre-analyzed questions`,
        );
      }

      // If paper summary was provided, use it
      if (body.paperSummary && !session.paper) {
        session.paper = {
          summary: body.paperSummary,
          rawText: body.paperText ?? "",
        };
      }

      // 3. Update HeyGen context with combined prompt (before bot creation)
      if (config.heygenApiKey && config.heygenContextId) {
        try {
          // Always start from the clean persona prompt, not accumulated context
          const basePrompt = DEFAULT_SYSTEM_PROMPT;

          const contextPrompt = buildHeygenContextPrompt(
            basePrompt,
            session.paper,
            body.comments,
            session.questions,
          );

          console.log(
            `[Session] ${session.id}: updating HeyGen context (${contextPrompt.length} chars)...`,
          );

          const heygenRes = await fetch(
            `https://api.liveavatar.com/v1/contexts/${config.heygenContextId}`,
            {
              method: "PATCH",
              headers: {
                "X-API-KEY": config.heygenApiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: "Kira Meeting Context",
                prompt: contextPrompt,
                opening_text: "",
              }),
            },
          );

          if (!heygenRes.ok) {
            const errText = await heygenRes.text();
            console.error(
              `[Session] ${session.id}: HeyGen context update failed (${heygenRes.status}): ${errText}`,
            );
          } else {
            console.log(
              `[Session] ${session.id}: HeyGen context updated successfully`,
            );
          }
        } catch (err) {
          console.error(
            `[Session] ${session.id}: HeyGen context update error:`,
            (err as Error).message,
          );
          // Non-fatal — continue with bot creation
        }
      }

      // 4. Create bot via Recall.ai and join the meeting
      try {
        sessionManager.updateState(session.id, SessionState.JOINING);

        const avatarUrl = `${config.avatarPublicUrl}?sessionId=${session.id}`;
        const botResult = await recall.createBot(
          body.meetingUrl,
          botName,
          avatarUrl,
          config.webhookBaseUrl,
          platform,
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
