import { describe, it, expect } from "vitest";

import { detectDirectAddress, buildNudgeMessage } from "./address-detector.js";

// These tests exercise the real regex-based detection logic in
// address-detector.ts. They assert on actual return values (no mocks), so they
// would fail if the production matching logic were reverted or broken.

describe("detectDirectAddress", () => {
  describe("addressed=true when the bot is named and a question/solicitation is present", () => {
    const positives = [
      "Kira, what do you think?",
      "Can Kira comment on this?",
      "I'd like to hear from Kira",
      "Kira, do you have a follow-up?",
    ];

    for (const text of positives) {
      it(`flags "${text}" as addressed`, () => {
        const result = detectDirectAddress(text);
        expect(result.addressed).toBe(true);
        expect(result.matchedName).toBe(true);
        expect(result.matchedQuestion).toBe(true);
      });
    }
  });

  describe("addressed=false", () => {
    it("does not flag a plain mention with no question", () => {
      const result = detectDirectAddress(
        "Kira did a great job on the last project.",
      );
      expect(result.addressed).toBe(false);
      expect(result.matchedName).toBe(true);
      expect(result.matchedQuestion).toBe(false);
    });

    it("does not flag a question that does not name the bot", () => {
      const result = detectDirectAddress("Does anyone have questions?");
      expect(result.addressed).toBe(false);
      expect(result.matchedName).toBe(false);
      expect(result.matchedQuestion).toBe(true);
    });

    it("does not flag empty input", () => {
      const result = detectDirectAddress("");
      expect(result.addressed).toBe(false);
      expect(result.matchedName).toBe(false);
    });

    it("does not flag whitespace-only input", () => {
      const result = detectDirectAddress("   ");
      expect(result.addressed).toBe(false);
      expect(result.matchedName).toBe(false);
    });
  });

  describe("case-insensitivity", () => {
    it("matches a lowercase bot name", () => {
      const result = detectDirectAddress("kira, thoughts?");
      expect(result.addressed).toBe(true);
      expect(result.matchedName).toBe(true);
    });
  });

  describe("custom bot name", () => {
    it("matches the configured name when the bot is renamed", () => {
      const result = detectDirectAddress("Nova, what do you think?", {
        name: "Nova",
      });
      expect(result.addressed).toBe(true);
      expect(result.matchedName).toBe(true);
      expect(result.matchedQuestion).toBe(true);
    });

    it("does NOT match the default 'Kira' when a different name is configured", () => {
      const result = detectDirectAddress("Kira, what do you think?", {
        name: "Nova",
      });
      expect(result.addressed).toBe(false);
      expect(result.matchedName).toBe(false);
    });

    it("matches a solicitation that names the renamed bot", () => {
      const result = detectDirectAddress("Can Nova comment on this?", {
        name: "Nova",
      });
      expect(result.addressed).toBe(true);
      expect(result.matchedName).toBe(true);
      expect(result.matchedQuestion).toBe(true);
    });

    it("falls back to 'Kira' when no name option is provided", () => {
      const result = detectDirectAddress("Kira, what do you think?");
      expect(result.addressed).toBe(true);
      expect(result.matchedName).toBe(true);
    });
  });

  describe("excerpt", () => {
    it("is trimmed, whitespace-collapsed, and non-empty for a real segment", () => {
      const result = detectDirectAddress("   Kira,   what   do you think?  ");
      expect(result.excerpt).toBe("Kira, what do you think?");
      expect(result.excerpt.length).toBeGreaterThan(0);
      // No leading/trailing whitespace and no runs of internal whitespace.
      expect(result.excerpt).toBe(result.excerpt.trim());
      expect(result.excerpt).not.toMatch(/\s{2,}/);
    });
  });
});

describe("buildNudgeMessage", () => {
  it("includes the excerpt and contains no em dash", () => {
    const excerpt = "Kira, what do you think?";
    const message = buildNudgeMessage(excerpt);
    expect(message).toContain(excerpt);
    // U+2014 EM DASH must never appear (CloudFront WAF constraint).
    expect(message).not.toContain("\u2014");
  });
});
