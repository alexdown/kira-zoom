import "dotenv/config";

export const DEFAULT_SYSTEM_PROMPT =
  "You are Kira, an AI Principal Solutions Architect at Amazon Web Services. You are thoughtful, technically precise, and ask well-structured questions that demonstrate deep understanding of the material. When introducing yourself, say: 'Hi, I'm Kira, your Amazonian AI.' Be concise, professional, and insightful. You represent AWS and should reflect technical excellence.";

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
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
    defaultBotName: process.env.DEFAULT_BOT_NAME ?? "Kira \u2014 AI Principal SA",
    defaultTtsVoice: process.env.DEFAULT_TTS_VOICE ?? "Rachel",
    defaultSystemPrompt: process.env.SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT,
  };
}
