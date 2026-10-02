import "dotenv/config";

export const DEFAULT_SYSTEM_PROMPT =
  "You are Kira, an AI Principal Solutions Architect at Amazon Web Services. You are thoughtful, technically precise, and ask well-structured questions that demonstrate deep understanding of the material. Introduce yourself only when asked to/prompted. When doing so, say: 'Hi, I'm Kira, your Amazonian AI.' Be concise, professional, and insightful. You represent AWS and should reflect technical excellence.\n\nBEHAVIOR: Listen actively. When someone answers, engage with follow-ups based on what they said. Don't just read scripted questions. Be conversational and genuinely curious.";

export const DEFAULT_PERSONALITY = {
  name: "Kira",
  style: "professional" as const,
  introPhrase: "Hi, I'm Kira, your Amazonian AI. I have a question about",
};

export const DEFAULT_RAISE_HAND_MESSAGE = "✋ Kira would like to ask a question";

export interface Config {
  recallApiKey: string;
  recallRegion: string;
  recallBaseUrl: string;
  elevenLabsApiKey: string;
  awsRegion: string;
  bedrockModelId: string;
  port: number;
  webhookBaseUrl: string;
  avatarPublicUrl: string;
  defaultBotName: string;
  defaultTtsVoice: string;
  defaultSystemPrompt: string;
  // HeyGen LiveAvatar
  heygenApiKey: string;
  heygenAvatarId: string;
  heygenVoiceId: string;
  heygenContextId: string;
  // Address detection / nudge
  /**
   * Default for whether the server nudges Kira when it detects she was directly
   * addressed in the transcript. When false, detection is skipped entirely and
   * the server defers to HeyGen to decide when Kira speaks.
   */
  transcriptNudgeEnabled: boolean;
  /**
   * Guard window (ms) after a detected direct address. The nudge is only sent
   * if the avatar has not started speaking within this window (double-response
   * guard). Default is about 5000 ms.
   */
  transcriptNudgeWindowMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Parse the transcript-nudge guard window (ms) from an env value, falling back
 * to a sane default when the value is missing or non-numeric. Guards against a
 * misconfigured TRANSCRIPT_NUDGE_WINDOW_MS producing NaN, which would make
 * setTimeout(NaN) fire immediately and collapse the double-response guard to a
 * zero-length window. Exported for unit testing.
 */
export function parseNudgeWindowMs(
  raw: string | undefined,
  fallback = 5000,
): number {
  const parsed = parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function loadConfig(): Config {
  const recallRegion = process.env.RECALL_REGION ?? "ap-northeast-1";

  return {
    recallApiKey: requireEnv("RECALL_API_KEY"),
    recallRegion,
    recallBaseUrl: `https://${recallRegion}.recall.ai/api/v1`,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    bedrockModelId:
      process.env.BEDROCK_MODEL_ID ?? "global.anthropic.claude-opus-4-6-v1",
    port: parseInt(process.env.PORT ?? "3000", 10),
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL ?? "http://localhost:3000",
    avatarPublicUrl: process.env.AVATAR_PUBLIC_URL ?? "http://localhost:5173",
    defaultBotName: process.env.DEFAULT_BOT_NAME ?? "Kira (AI Principal SA)",
    defaultTtsVoice: process.env.DEFAULT_TTS_VOICE ?? "Rachel",
    defaultSystemPrompt: process.env.SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT,
    // HeyGen LiveAvatar
    heygenApiKey: process.env.HEYGEN_API_KEY ?? "",
    heygenAvatarId:
      process.env.HEYGEN_AVATAR_ID ?? "0aae6046-0ab9-44fe-a08d-c5ac3f406d34",
    heygenVoiceId:
      process.env.HEYGEN_VOICE_ID ?? "b2bd6569-a537-4342-aeca-a1f15d2a2c97",
    heygenContextId:
      process.env.HEYGEN_CONTEXT_ID ?? "4aff4b76-74af-4329-8910-705585d08fad",
    // Address detection / nudge
    transcriptNudgeEnabled: !["false", "0"].includes(
      (process.env.TRANSCRIPT_NUDGE_ENABLED ?? "true").trim().toLowerCase(),
    ),
    transcriptNudgeWindowMs: parseNudgeWindowMs(
      process.env.TRANSCRIPT_NUDGE_WINDOW_MS,
      5000,
    ),
  };
}
