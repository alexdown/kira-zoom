// ──────────────────────────────────────────────
// CLI: leave — leave a meeting session
// ──────────────────────────────────────────────

import { api, handleError } from "../helpers.js";

interface LeaveResponse {
  state?: string;
  message?: string;
}

export async function leaveCommand(sessionId: string): Promise<void> {
  try {
    console.log(`👋 Leaving session ${sessionId}...`);

    const res = await api<LeaveResponse>(`/api/sessions/${sessionId}/leave`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    console.log(`✔ Left the meeting.`);
    if (res?.state) console.log(`  State: ${res.state}`);
    if (res?.message) console.log(`  ${res.message}`);
    console.log();
  } catch (err) {
    handleError(err);
  }
}
