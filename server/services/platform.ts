/**
 * Meeting-platform detection.
 *
 * Determines which conferencing platform a meeting URL belongs to so the
 * Recall.ai bot payload can carry the join URL in the correct field.
 */

export type Platform = "zoom" | "teams";

/**
 * Detect the meeting platform from a meeting URL.
 *
 * A hostname of `teams.microsoft.com` (or any `*.teams.microsoft.com`
 * subdomain, compared case-insensitively) is treated as Microsoft Teams.
 * Anything else — including malformed/unparseable input — defaults to Zoom.
 * This function never throws.
 */
export function detectPlatform(meetingUrl: string): Platform {
  try {
    const hostname = new URL(meetingUrl).hostname.toLowerCase();
    if (
      hostname === "teams.microsoft.com" ||
      hostname.endsWith(".teams.microsoft.com")
    ) {
      return "teams";
    }
    return "zoom";
  } catch {
    return "zoom";
  }
}
