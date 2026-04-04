export function reportDebug(stage: string, error: string, details?: string) {
  console.error(`[DEBUG] ${stage}: ${error}`, details);
  fetch("/api/heygen/debug", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, error, details: details?.substring(0, 500) }),
  }).catch(() => {});
}
