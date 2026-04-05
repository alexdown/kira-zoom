import { Router, type Request, type Response } from "express";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.js";
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_PERSONALITY,
} from "../config.js";
import type { SessionManager } from "../services/session-manager.js";
import type { LLMService } from "../services/llm.js";
import {
  extractTextFromBuffer,
} from "../services/paper-reader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ExtractedComment {
  id: string;
  author: string;
  date: string;
  comment: string;
  anchored_text: string;
}

/**
 * Extract DOCX comments by shelling out to the Python script.
 */
function extractDocxComments(filePath: string): ExtractedComment[] {
  try {
    const scriptPath = path.resolve(
      __dirname,
      "../utils/extract_comments.py",
    );
    const output = execSync(
      `python3 "${scriptPath}" --json "${filePath}"`,
      { encoding: "utf-8", timeout: 15000 },
    );
    return JSON.parse(output.trim()) as ExtractedComment[];
  } catch (err) {
    console.warn(
      "[Dashboard] DOCX comment extraction failed:",
      (err as Error).message,
    );
    return [];
  }
}

export function createDashboardRouter(
  config: Config,
  sessionManager: SessionManager,
  llm: LLMService,
): Router {
  const router = Router();

  // ── POST /api/papers/extract ──────────────────
  // Extract text + comments from a file (base64-encoded body)

  router.post("/papers/extract", async (req: Request, res: Response) => {
    try {
      const { data, fileName } = req.body as {
        data?: string; // base64-encoded file content
        fileName?: string;
      };

      if (!data || !fileName) {
        res
          .status(400)
          .json({ error: "data (base64) and fileName are required" });
        return;
      }

      const ext = path.extname(fileName).toLowerCase();
      if (![".pdf", ".docx", ".txt"].includes(ext)) {
        res
          .status(400)
          .json({ error: `Unsupported file type: ${ext}. Supported: .pdf, .docx, .txt` });
        return;
      }

      console.log(
        `[Dashboard] Extracting text from ${fileName} (${ext})...`,
      );

      // Decode base64 to buffer
      const buffer = Buffer.from(data, "base64");

      // Extract text using the paper-reader service
      const text = await extractTextFromBuffer(buffer, ext);

      // Extract DOCX comments if applicable
      let comments: ExtractedComment[] = [];
      if (ext === ".docx") {
        // Write to temp file for Python script
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `kira_extract_${Date.now()}${ext}`);
        fs.writeFileSync(tmpFile, buffer);
        try {
          comments = extractDocxComments(tmpFile);
        } finally {
          try {
            fs.unlinkSync(tmpFile);
          } catch {
            // cleanup best-effort
          }
        }
      }

      console.log(
        `[Dashboard] Extracted ${text.length} chars, ${comments.length} comments from ${fileName}`,
      );

      res.json({ text, comments });
    } catch (err) {
      console.error(
        "[Dashboard] File extraction error:",
        (err as Error).message,
      );
      res.status(500).json({
        error: `File extraction failed: ${(err as Error).message}`,
      });
    }
  });

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
