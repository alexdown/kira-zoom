import type { Config } from "../config.js";
import { RecallService } from "./recall.js";

// ──────────────────────────────────────────────
// Voice ID mapping for ElevenLabs
// ──────────────────────────────────────────────

const ELEVENLABS_VOICE_IDS: Record<string, string> = {
  Rachel: "21m00Tcm4TlvDq8ikWAM",
  Domi: "AZnzlk1XvdvUeBnXmlld",
  Bella: "EXAVITQu4vr4xnSDxMaL",
  Antoni: "ErXwobaYiN019PkySvjV",
  Elli: "MF3mGyEYCl7XYWbV9V6O",
  Josh: "TxGEqnHWrfWFTfGW9XjX",
  Arnold: "VR6AewLTigWG4xSOukaG",
  Adam: "pNInz6obpgDQGcFmaJgB",
  Sam: "yoZ06aMxZJJ28mfd3POQ",
};

/**
 * TTS generation + audio playback in meetings.
 *
 * Uses ElevenLabs for speech synthesis.
 */
export class SpeakerService {
  private config: Config;
  private recall: RecallService;

  constructor(config: Config, recall: RecallService) {
    this.config = config;
    this.recall = recall;
  }

  /**
   * Generate speech audio from text via ElevenLabs.
   * @returns Buffer of mp3 audio bytes
   */
  async generateSpeech(text: string, voice?: string): Promise<Buffer> {
    if (!this.config.elevenLabsApiKey) {
      throw new Error(
        "No TTS provider available — set ELEVENLABS_API_KEY",
      );
    }

    const voiceName = voice ?? this.config.defaultTtsVoice;
    return this.generateElevenLabs(text, voiceName);
  }

  /**
   * Generate TTS audio and send it to the meeting via Recall.ai.
   */
  async speakInMeeting(
    botId: string,
    text: string,
    voice?: string,
  ): Promise<{ audioDurationMs: number }> {
    const audioBuffer = await this.generateSpeech(text, voice);
    const audioBase64 = audioBuffer.toString("base64");

    await this.recall.outputAudio(botId, audioBase64, "mp3");

    // Rough duration estimate: mp3 at ~128kbps → bytes * 8 / 128000 * 1000
    const estimatedDurationMs = Math.round(
      (audioBuffer.length * 8) / 128000 * 1000,
    );

    return { audioDurationMs: estimatedDurationMs };
  }

  // ── Private: ElevenLabs ───────────────────────

  private async generateElevenLabs(
    text: string,
    voiceName: string,
  ): Promise<Buffer> {
    const voiceId =
      ELEVENLABS_VOICE_IDS[voiceName] ?? ELEVENLABS_VOICE_IDS["Rachel"]!;

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": this.config.elevenLabsApiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });
    } catch (err) {
      throw new Error(
        `ElevenLabs network error: ${(err as Error).message}`,
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ElevenLabs API error (${res.status}): ${errText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
