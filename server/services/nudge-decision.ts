// ──────────────────────────────────────────────
// Nudge decision (pure, dependency-free)
// ──────────────────────────────────────────────
//
// Decides whether a scheduled nudge should actually fire when its guard timer
// elapses. Extracted from the live-server orchestration in server/index.ts so
// the guard behavior can be unit-tested with a fake clock (no sockets, no real
// timers). This module has ZERO runtime dependencies.
//
// The decision answers one question: given when a direct address was detected,
// when the avatar last started speaking, the last nudge we sent, whether the
// feature is enabled, and the guard window, should we SPEAK a nudge now?

/** A record of the most recent nudge the server dispatched for a session. */
export interface LastNudge {
  /** Normalized excerpt that was nudged. */
  excerpt: string;
  /** Epoch ms when the nudge was dispatched. */
  time: number;
}

/** Inputs to {@link decideNudge}. All times are epoch milliseconds. */
export interface NudgeDecisionInput {
  /** When the direct address was detected (guard timer start). */
  detectionTime: number;
  /** Normalized excerpt of the current detection (for duplicate suppression). */
  excerpt: string;
  /**
   * When the avatar last started speaking, or null/undefined if it has not
   * started speaking since the server started tracking.
   */
  lastAvatarSpeakStartedAt: number | null | undefined;
  /** The last nudge dispatched for this session, or null if none. */
  lastNudge: LastNudge | null | undefined;
  /** Whether transcript nudging is enabled for this session. */
  enabled: boolean;
  /** Guard window in ms (also used as the duplicate-suppression window). */
  windowMs: number;
  /** Current time (epoch ms); injectable for testing. */
  now: number;
}

/** Why a nudge fired or was suppressed. */
export type NudgeDecisionReason =
  | "fire"
  | "suppress-disabled"
  | "suppress-avatar-speaking"
  | "suppress-duplicate";

/** Result of {@link decideNudge}. */
export interface NudgeDecision {
  /** True only when the nudge should be spoken. */
  nudge: boolean;
  /** Machine-readable reason, suitable for a log line. */
  reason: NudgeDecisionReason;
}

/**
 * Pure guard decision run when a nudge timer elapses.
 *
 * Order of checks:
 *   1. suppress-disabled: nudging turned off for this session.
 *   2. suppress-avatar-speaking: the avatar started speaking at any point AFTER
 *      the address was detected, so HeyGen already answered.
 *   3. suppress-duplicate: an identical excerpt was nudged within the window.
 *   4. fire: otherwise send the nudge.
 */
export function decideNudge(input: NudgeDecisionInput): NudgeDecision {
  const {
    detectionTime,
    excerpt,
    lastAvatarSpeakStartedAt,
    lastNudge,
    enabled,
    windowMs,
    now,
  } = input;

  if (!enabled) {
    return { nudge: false, reason: "suppress-disabled" };
  }

  // If the avatar started speaking after we detected the address, HeyGen is
  // already handling it. Treat "at or after" as handled to avoid races.
  if (
    typeof lastAvatarSpeakStartedAt === "number" &&
    lastAvatarSpeakStartedAt >= detectionTime
  ) {
    return { nudge: false, reason: "suppress-avatar-speaking" };
  }

  // Debounce: the same excerpt nudged within the window is a duplicate.
  if (
    lastNudge &&
    lastNudge.excerpt === excerpt &&
    now - lastNudge.time < windowMs
  ) {
    return { nudge: false, reason: "suppress-duplicate" };
  }

  return { nudge: true, reason: "fire" };
}
