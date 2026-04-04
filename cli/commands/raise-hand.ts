// ──────────────────────────────────────────────
// CLI: raise-hand
// ──────────────────────────────────────────────

import { api, handleError } from "../helpers.js";

interface RaiseHandResponse {
  state?: string;
  message?: string;
}

export async function raiseHandCommand(sessionId: string): Promise<void> {
  try {
    console.log(`✋ Raising hand for session ${sessionId}...`);

    const res = await api<RaiseHandResponse>(`/api/sessions/${sessionId}/raise-hand`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    console.log(`✔ Hand raised!`);
    if (res?.state) console.log(`  State: ${res.state}`);
    if (res?.message) console.log(`  ${res.message}`);
    console.log();
  } catch (err) {
    handleError(err);
  }
}
