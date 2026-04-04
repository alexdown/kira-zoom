// ──────────────────────────────────────────────
// CLI: analyze-paper — analyze without joining
// ──────────────────────────────────────────────

import fs from "node:fs";
import { api, header, handleError } from "../helpers.js";

interface AnalyzeOptions {
  file: string;
}

interface Question {
  id: string;
  text: string;
  rationale: string;
  priority: number;
}

interface AnalyzeResponse {
  summary?: string;
  questions?: Question[];
  message?: string;
}

export async function analyzePaperCommand(options: AnalyzeOptions): Promise<void> {
  try {
    const filePath = options.file;

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const paperText = fs.readFileSync(filePath, "utf-8");
    console.log(`📄 Analyzing paper: ${filePath} (${paperText.length} chars)`);

    const res = await api<AnalyzeResponse>("/api/analyze-paper", {
      method: "POST",
      body: JSON.stringify({ paperText }),
    });

    if (res?.summary) {
      header("Paper Summary");
      console.log(`  ${res.summary}`);
    }

    if (res?.questions?.length) {
      header("Generated Questions");
      for (const q of res.questions) {
        console.log(`\n  [${q.priority}] ${q.text}`);
        console.log(`      Rationale: ${q.rationale}`);
      }
    }

    if (res?.message) {
      console.log(`\n  ${res.message}`);
    }

    console.log();
  } catch (err) {
    handleError(err);
  }
}
