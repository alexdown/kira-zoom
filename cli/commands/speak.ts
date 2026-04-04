// ──────────────────────────────────────────────
// CLI: speak — speak a question or custom text
// ──────────────────────────────────────────────

import { api, header, handleError } from "../helpers.js";

interface SpeakOptions {
  text?: string;
  questionId?: string;
}

interface SpeakResponse {
  state?: string;
  spokenText?: string;
  questionId?: string;
  message?: string;
}

export async function speakCommand(
  sessionId: string,
  options: SpeakOptions
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {};
    if (options.text) payload.text = options.text;
    if (options.questionId) payload.questionId = options.questionId;

    console.log(`🎙  Speaking in session ${sessionId}...`);

    const res = await api<SpeakResponse>(`/api/sessions/${sessionId}/speak`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    header("Spoken");
    if (res?.spokenText) {
      console.log(`  "${res.spokenText}"`);
    } else if (options.text) {
      console.log(`  "${options.text}"`);
    }
    if (res?.questionId) console.log(`  Question ID: ${res.questionId}`);
    if (res?.state) console.log(`  State: ${res.state}`);
    if (res?.message) console.log(`  ${res.message}`);
    console.log();
  } catch (err) {
    handleError(err);
  }
}
