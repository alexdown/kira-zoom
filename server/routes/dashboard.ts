import { Router, type Request, type Response } from "express";
import type { Config } from "../config.js";
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_PERSONALITY,
} from "../config.js";
import type { SessionManager } from "../services/session-manager.js";
import type { LLMService } from "../services/llm.js";

export function createDashboardRouter(
  config: Config,
  sessionManager: SessionManager,
  llm: LLMService,
): Router {
  const router = Router();

  // ── POST /api/papers/analyze ──────────────────
  // Analyze paper text without creating a session

  router.post("/papers/analyze", async (req: Request, res: Response) => {
    try {
      const { text, maxQuestions, personality, systemPrompt } = req.body as {
        text?: string;
        maxQuestions?: number;
        personality?: { style?: string };
        systemPrompt?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: "No text provided" });
        return;
      }

      console.log(
        `[Dashboard] Analyzing paper (${text.length} chars, maxQ=${maxQuestions ?? 5})`,
      );

      const analysis = await llm.analyzePaper(
        text,
        systemPrompt,
        personality as { style?: "academic" | "casual" | "provocative" | "professional" },
      );

      // Trim questions to maxQuestions
      const max = maxQuestions ?? 5;
      if (analysis.questions.length > max) {
        analysis.questions = analysis.questions.slice(0, max);
      }

      console.log(
        `[Dashboard] Paper analyzed: ${analysis.questions.length} questions generated`,
      );

      res.json(analysis);
    } catch (err) {
      console.error("[Dashboard] Paper analysis error:", (err as Error).message);
      res.status(500).json({
        error: `Paper analysis failed: ${(err as Error).message}`,
      });
    }
  });

  // ── PATCH /api/sessions/:id/questions ─────────
  // Update questions for an existing session

  router.patch("/sessions/:id/questions", (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { questions } = req.body as { questions?: unknown[] };

      if (!questions || !Array.isArray(questions)) {
        res.status(400).json({ error: "questions array is required" });
        return;
      }

      const session = sessionManager.getSession(id);
      session.questions = questions as typeof session.questions;

      console.log(
        `[Dashboard] Updated ${questions.length} questions for session ${id}`,
      );

      res.json({ questions: session.questions });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ error: msg });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  // ── GET /api/sessions/:id/transcript ──────────
  // Download transcript as plain text

  router.get(
    "/sessions/:id/transcript",
    (req: Request, res: Response) => {
      try {
        const id = req.params.id as string;
        const session = sessionManager.getSession(id);

        const lines: string[] = [
          `Meeting Transcript — ${session.botName}`,
          `Date: ${new Date(session.createdAt).toISOString().split("T")[0]}`,
          `Meeting: ${session.meetingUrl}`,
          `Segments: ${session.transcript.length}`,
          "",
          "─".repeat(40),
          "",
        ];

        for (const seg of session.transcript) {
          const time = new Date(seg.timestamp).toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          lines.push(`[${time}] ${seg.speaker}:`);
          lines.push(seg.text);
          lines.push("");
        }

        const content = lines.join("\n");

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="transcript-${id}.txt"`,
        );
        res.send(content);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("not found")) {
          res.status(404).json({ error: msg });
        } else {
          res.status(500).json({ error: msg });
        }
      }
    },
  );

  // ── GET /api/config/defaults ──────────────────
  // Server default configuration

  router.get("/config/defaults", (_req: Request, res: Response) => {
    res.json({
      defaultBotName: config.defaultBotName,
      defaultTtsVoice: config.defaultTtsVoice,
      defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
      availableVoices: [
        "Rachel",
        "Domi",
        "Bella",
        "Antoni",
        "Elli",
        "Josh",
        "Arnold",
        "Adam",
        "Sam",
      ],
      availableStyles: ["academic", "casual", "provocative", "professional"],
      personality: DEFAULT_PERSONALITY,
    });
  });

  return router;
}
