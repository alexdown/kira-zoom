// ──────────────────────────────────────────────
// CLI: send-chat — send a chat message in the meeting
// ──────────────────────────────────────────────

import { api, handleError } from "../helpers.js";

interface SendChatOptions {
  message: string;
}

interface SendChatResponse {
  state?: string;
  message?: string;
}

export async function sendChatCommand(
  sessionId: string,
  options: SendChatOptions
): Promise<void> {
  try {
    console.log(`💬 Sending chat in session ${sessionId}...`);

    const res = await api<SendChatResponse>(`/api/sessions/${sessionId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message: options.message }),
    });

    console.log(`✔ Chat sent: "${options.message}"`);
    if (res?.message) console.log(`  ${res.message}`);
    console.log();
  } catch (err) {
    handleError(err);
  }
}
