// ──────────────────────────────────────────────
// CLI: lower-hand
// ──────────────────────────────────────────────

import { api, handleError } from "../helpers.js";

interface LowerHandResponse {
  state?: string;
  message?: string;
}

export async function lowerHandCommand(sessionId: string): Promise<void> {
  try {
    console.log(`🤚 Lowering hand for session ${sessionId}...`);

    const res = await api<LowerHandResponse>(`/api/sessions/${sessionId}/lower-hand`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    console.log(`✔ Hand lowered.`);
    if (res?.state) console.log(`  State: ${res.state}`);
    if (res?.message) console.log(`  ${res.message}`);
    console.log();
  } catch (err) {
    handleError(err);
  }
}
