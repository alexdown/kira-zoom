import { describe, it, expect } from "vitest";

import { parseNudgeWindowMs } from "./config.js";

// parseNudgeWindowMs is a pure parser for the transcript-nudge guard window.
// These tests pin down the NaN/invalid-input guard: a bad value must NOT
// collapse the guard window to zero (setTimeout(NaN) fires immediately), it
// must fall back to the default. They assert on real return values (no mocks).

describe("parseNudgeWindowMs", () => {
  it("parses a valid numeric string", () => {
    expect(parseNudgeWindowMs("8000", 5000)).toBe(8000);
  });

  it("falls back to the default when the value is undefined", () => {
    expect(parseNudgeWindowMs(undefined, 5000)).toBe(5000);
  });

  it("falls back to the default for a non-numeric value (NaN guard)", () => {
    // parseInt("abc") is NaN; without the guard this would make setTimeout
    // fire immediately and defeat the double-response guard.
    expect(parseNudgeWindowMs("abc", 5000)).toBe(5000);
  });

  it("falls back to the default for an empty string", () => {
    expect(parseNudgeWindowMs("", 5000)).toBe(5000);
  });

  it("falls back to the default for a negative value", () => {
    expect(parseNudgeWindowMs("-100", 5000)).toBe(5000);
  });

  it("uses the built-in 5000 default when no fallback is passed", () => {
    expect(parseNudgeWindowMs("not-a-number")).toBe(5000);
  });

  it("accepts zero as an explicit valid value", () => {
    expect(parseNudgeWindowMs("0", 5000)).toBe(0);
  });
});
