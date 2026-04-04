// ──────────────────────────────────────────────
// Shared helpers for CLI commands
// ──────────────────────────────────────────────

export const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";

/**
 * Make an API request and return parsed JSON.
 * Throws with a readable message on non-2xx responses.
 */
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${SERVER_URL}${path}`;

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers as Record<string, string> },
    ...options,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json() as { error?: string };
      detail = body.error ? `: ${body.error}` : "";
    } catch {
      // no parseable body
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}${detail}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

/**
 * Print a labelled key-value pair.
 */
export function kv(label: string, value: unknown): void {
  console.log(`  ${label.padEnd(16)} ${value ?? "—"}`);
}

/**
 * Print a section header.
 */
export function header(text: string): void {
  console.log(`\n${"─".repeat(48)}`);
  console.log(`  ${text}`);
  console.log(`${"─".repeat(48)}`);
}

/**
 * Wrap a command action so unhandled errors print nicely.
 */
export function handleError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n✖ Error: ${msg}`);
  process.exit(1);
}
