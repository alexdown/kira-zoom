// ──────────────────────────────────────────────
// Address detector (pure, dependency-free)
// ──────────────────────────────────────────────
//
// Decides whether a FINAL transcript segment is a direct address to Kira:
// the bot name appears as a whole word AND the segment carries a question or
// a solicitation. This module has ZERO runtime dependencies (no express/ws,
// no node-only APIs) so it is trivially unit-testable.
//
// AGENTS.md constraint: never emit em dash characters in bot-facing strings
// (they trigger a CloudFront WAF). Only plain ASCII punctuation is used here.

/** Options for {@link detectDirectAddress}. */
export interface DetectDirectAddressOptions {
  /** Bot name to match on, case-insensitive, whole-word. Defaults to "Kira". */
  name?: string;
}

/** Result of {@link detectDirectAddress}. */
export interface DetectDirectAddressResult {
  /** True when the segment both names the bot and carries a question/solicitation. */
  addressed: boolean;
  /** Trimmed, whitespace-collapsed segment text, capped to a sane length. */
  excerpt: string;
  /** True when the bot name matched as a whole word (case-insensitive). */
  matchedName: boolean;
  /** True when the segment is a question or a known solicitation pattern. */
  matchedQuestion: boolean;
}

/** Maximum length of the excerpt included in a nudge. */
const MAX_EXCERPT_LENGTH = 300;

/**
 * Escape a string for safe interpolation into a RegExp.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Collapse all runs of whitespace to a single space and trim the ends.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Build an excerpt: whitespace-collapsed, trimmed, and capped to
 * MAX_EXCERPT_LENGTH characters.
 */
function buildExcerpt(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= MAX_EXCERPT_LENGTH) {
    return normalized;
  }
  return normalized.slice(0, MAX_EXCERPT_LENGTH).trimEnd();
}

/**
 * Whole-word, case-insensitive match on the bot name. Uses word boundaries so
 * "Kirana" or "Ukraine" do NOT match, while trailing punctuation like "Kira,"
 * or "Kira?" DOES match.
 */
function hasNameMention(text: string, name: string): boolean {
  const nameRe = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
  return nameRe.test(text);
}

/**
 * Detect a question or solicitation. Returns true when the text contains a
 * question mark OR matches one of the known solicitation / interrogative
 * patterns (which may be addressed to the bot by name).
 */
function hasQuestionOrSolicitation(text: string, name: string): boolean {
  // A literal question mark is the strongest signal.
  if (text.includes("?")) {
    return true;
  }

  const n = escapeRegExp(name);

  // Readable, case-insensitive solicitation / interrogative patterns. Each one
  // captures a natural way of inviting the bot to respond without ending in a
  // question mark (e.g. a transcript that dropped the punctuation).
  const solicitationPatterns: RegExp[] = [
    // "what do you think", "what are your thoughts"
    /\bwhat (do|are) you\b/i,
    // "any thoughts", "your thoughts", "your take", "your view"
    /\b(any|your) (thoughts?|take|view|opinion)\b/i,
    // "do you have ...", "do you think ..."
    /\bdo you (have|think|know)\b/i,
    // "weigh in", "chime in"
    /\b(weigh|chime) in\b/i,
    // "can <name> comment", "could <name> weigh in", "would <name> ..."
    new RegExp(`\\b(can|could|would|will)\\s+${n}\\b`, "i"),
    // "hear from <name>", "over to <name>", "turn it over to <name>"
    new RegExp(`\\b(hear from|over to|turn (it|this) over to)\\s+${n}\\b`, "i"),
    // "go ahead <name>", "<name> go ahead"
    new RegExp(`\\bgo ahead,?\\s+${n}\\b`, "i"),
    new RegExp(`\\b${n},?\\s+go ahead\\b`, "i"),
    // "<name>, what/why/how/can/could/would/do/does/is/are ..."
    // NOTE: bare past-tense "did" is intentionally excluded here because it is
    // commonly a plain narration verb ("Kira did a great job") rather than an
    // interrogative. The "do"/"does" forms still cover solicitations, and any
    // genuine question ("Kira, did you ...?") is caught by the "?" check above.
    new RegExp(
      `\\b${n}\\b[\\s,]+(what|why|how|can|could|would|do|does|is|are|should|tell|give|share|comment|thoughts?|think)\\b`,
      "i",
    ),
    // "comment on", "follow-up", "follow up" when the bot is named in the segment
    /\b(comment on|follow[- ]up)\b/i,
  ];

  return solicitationPatterns.some((re) => re.test(text));
}

/**
 * Pure detector: is this transcript segment a direct address to the bot?
 *
 * addressed = matchedName && matchedQuestion.
 */
export function detectDirectAddress(
  text: string,
  options?: DetectDirectAddressOptions,
): DetectDirectAddressResult {
  const name = options?.name?.trim() || "Kira";
  const source = typeof text === "string" ? text : "";

  const matchedName = hasNameMention(source, name);
  const matchedQuestion = hasQuestionOrSolicitation(source, name);

  return {
    addressed: matchedName && matchedQuestion,
    excerpt: buildExcerpt(source),
    matchedName,
    matchedQuestion,
  };
}

/**
 * Build the spoken nudge message for the avatar. Uses plain ASCII double quotes
 * and contains NO em dash character (AGENTS.md: em dashes trigger a CloudFront
 * WAF).
 */
export function buildNudgeMessage(excerpt: string): string {
  return `Someone just asked you a question. Please respond to: "${excerpt}"`;
}
