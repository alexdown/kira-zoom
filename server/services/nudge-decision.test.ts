import { describe, it, expect } from "vitest";

import {
  decideNudge,
  type NudgeDecisionInput,
} from "./nudge-decision.js";

// These tests exercise the real pure decision logic in nudge-decision.ts using
// explicit numeric timestamps as a fake clock. No real timers or mocks are
// needed because decideNudge is pure. Each case would fail if the production
// decision order were reverted or broken.

/** Build a baseline "fire" input; override individual fields per test. */
function baseInput(overrides: Partial<NudgeDecisionInput> = {}): NudgeDecisionInput {
  return {
    detectionTime: 1_000,
    excerpt: "Kira, what do you think?",
    lastAvatarSpeakStartedAt: null,
    lastNudge: null,
    enabled: true,
    windowMs: 5_000,
    now: 6_000,
    ...overrides,
  };
}

describe("decideNudge", () => {
  it("fires when enabled, no avatar speech after detection, and not a duplicate", () => {
    const decision = decideNudge(baseInput());
    expect(decision.nudge).toBe(true);
    expect(decision.reason).toBe("fire");
  });

  it("fires when the avatar last spoke BEFORE detection (stale speech)", () => {
    const decision = decideNudge(
      baseInput({ detectionTime: 1_000, lastAvatarSpeakStartedAt: 500 }),
    );
    expect(decision.nudge).toBe(true);
    expect(decision.reason).toBe("fire");
  });

  it("suppresses when disabled", () => {
    const decision = decideNudge(baseInput({ enabled: false }));
    expect(decision.nudge).toBe(false);
    expect(decision.reason).toBe("suppress-disabled");
  });

  it("suppresses when the avatar started speaking after detection", () => {
    const decision = decideNudge(
      baseInput({ detectionTime: 1_000, lastAvatarSpeakStartedAt: 2_000 }),
    );
    expect(decision.nudge).toBe(false);
    expect(decision.reason).toBe("suppress-avatar-speaking");
  });

  it("suppresses when the avatar started speaking exactly at detection time (tie counts as handled)", () => {
    const decision = decideNudge(
      baseInput({ detectionTime: 1_000, lastAvatarSpeakStartedAt: 1_000 }),
    );
    expect(decision.nudge).toBe(false);
    expect(decision.reason).toBe("suppress-avatar-speaking");
  });

  it("suppresses a duplicate excerpt nudged within the window", () => {
    const decision = decideNudge(
      baseInput({
        excerpt: "Kira, what do you think?",
        lastNudge: { excerpt: "Kira, what do you think?", time: 3_000 },
        windowMs: 5_000,
        now: 6_000, // 6000 - 3000 = 3000 < 5000 -> duplicate
      }),
    );
    expect(decision.nudge).toBe(false);
    expect(decision.reason).toBe("suppress-duplicate");
  });

  it("fires when the same excerpt was last nudged OUTSIDE the window", () => {
    const decision = decideNudge(
      baseInput({
        excerpt: "Kira, what do you think?",
        lastNudge: { excerpt: "Kira, what do you think?", time: 500 },
        windowMs: 5_000,
        now: 6_000, // 6000 - 500 = 5500 >= 5000 -> not a duplicate
      }),
    );
    expect(decision.nudge).toBe(true);
    expect(decision.reason).toBe("fire");
  });

  it("fires when a recent nudge had a DIFFERENT excerpt", () => {
    const decision = decideNudge(
      baseInput({
        excerpt: "Kira, any thoughts on the results?",
        lastNudge: { excerpt: "Kira, what do you think?", time: 5_900 },
        windowMs: 5_000,
        now: 6_000,
      }),
    );
    expect(decision.nudge).toBe(true);
    expect(decision.reason).toBe("fire");
  });
});
