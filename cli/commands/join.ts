// ──────────────────────────────────────────────
// CLI: join — create session & join meeting
// ──────────────────────────────────────────────

import fs from "node:fs";
import { api, header, kv, handleError } from "../helpers.js";

interface JoinOptions {
  meetingUrl: string;
  paper?: string;
  botName: string;
  autoRaise?: boolean;
}

interface Question {
  id: string;
  text: string;
  rationale: string;
  priority: number;
  status: string;
}

interface JoinResponse {
  id: string;
  state: string;
  botName: string;
  meetingUrl: string;
  questions: Question[];
  paper?: { summary: string };
  createdAt: string;
}

export async function joinCommand(options: JoinOptions): Promise<void> {
  try {
    let paperText: string | undefined;

    // Read paper file if provided
    if (options.paper) {
      const filePath = options.paper;
      if (!fs.existsSync(filePath)) {
        throw new Error(`Paper file not found: ${filePath}`);
      }
      paperText = fs.readFileSync(filePath, "utf-8");
      console.log(`📄 Read paper from ${filePath} (${paperText.length} chars)`);
    }

    console.log(`🔗 Joining meeting: ${options.meetingUrl}`);
    console.log(`🤖 Bot name: ${options.botName}`);

    const session = await api<JoinResponse>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        meetingUrl: options.meetingUrl,
        botName: options.botName,
        paperText,
        config: {
          autoRaiseHand: options.autoRaise ?? false,
        },
      }),
    });

    header("Session Created");
    kv("Session ID", session.id);
    kv("State", session.state);
    kv("Bot Name", session.botName);
    kv("Created", session.createdAt);

    if (session.paper?.summary) {
      header("Paper Summary");
      console.log(`  ${session.paper.summary}`);
    }

    if (session.questions?.length > 0) {
      header("Prepared Questions");
      for (const q of session.questions) {
        console.log(`\n  [${q.priority}] ${q.text}`);
        console.log(`      Rationale: ${q.rationale}`);
        console.log(`      ID: ${q.id}  Status: ${q.status}`);
      }
    }

    console.log(`\n✔ Session ${session.id} is ready. Use this ID for further commands.\n`);
  } catch (err) {
    handleError(err);
  }
}
