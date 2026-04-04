// ──────────────────────────────────────────────
// CLI: status — get session info or list all
// ──────────────────────────────────────────────

import { api, header, kv, handleError } from "../helpers.js";

interface Question {
  id: string;
  text: string;
  priority: number;
  status: string;
}

interface SessionSummary {
  id: string;
  state: string;
  botName: string;
  meetingUrl: string;
  questions: Question[];
  transcript: unknown[];
  createdAt: string;
  handRaisedAt?: string;
  spokeAt?: string;
}

export async function statusCommand(sessionId?: string): Promise<void> {
  try {
    if (sessionId) {
      // ── Single session detail ────────────────────
      const s = await api<SessionSummary>(`/api/sessions/${sessionId}`);

      header(`Session ${s.id}`);
      kv("State", s.state);
      kv("Bot Name", s.botName);
      kv("Meeting URL", s.meetingUrl);
      kv("Created", s.createdAt);
      kv("Hand Raised", s.handRaisedAt);
      kv("Last Spoke", s.spokeAt);
      kv("Transcript", `${s.transcript?.length ?? 0} segments`);

      if (s.questions?.length > 0) {
        header("Questions");
        for (const q of s.questions) {
          const marker =
            q.status === "ready" ? "○" :
            q.status === "raised" ? "◉" :
            q.status === "asked" ? "✔" : "✖";
          console.log(`  ${marker} [${q.priority}] ${q.text}  (${q.status})`);
        }
      }
    } else {
      // ── List all sessions ────────────────────────
      const sessions = await api<SessionSummary[]>("/api/sessions");

      if (!sessions || sessions.length === 0) {
        console.log("\nNo active sessions.\n");
        return;
      }

      header(`All Sessions (${sessions.length})`);
      for (const s of sessions) {
        const qCount = s.questions?.length ?? 0;
        const tCount = (s.transcript as unknown[])?.length ?? 0;
        console.log(
          `  ${s.id}  │  ${s.state.padEnd(12)}  │  ${s.botName}  │  ${qCount} questions  │  ${tCount} transcript`
        );
      }
    }
    console.log();
  } catch (err) {
    handleError(err);
  }
}
