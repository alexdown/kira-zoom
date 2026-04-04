import type { Config } from "../config.js";

/**
 * Recall.ai REST API client.
 *
 * All methods are async and target the region-specific base URL
 * (e.g. https://ap-northeast-1.recall.ai/api/v1).
 */
export class RecallService {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: Config) {
    this.baseUrl = config.recallBaseUrl;
    this.apiKey = config.recallApiKey;
  }

  // ── helpers ───────────────────────────────────

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Token ${this.apiKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.headers(),
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(url, options);
      const text = await res.text();

      if (!res.ok) {
        throw new Error(
          `Recall API ${method} ${path} failed (${res.status}): ${text}`,
        );
      }

      // Some endpoints return empty body on success (e.g. DELETE)
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Recall API")) {
        throw err;
      }
      throw new Error(
        `Recall API ${method} ${path} network error: ${(err as Error).message}`,
      );
    }
  }

  // ── public methods ────────────────────────────

  /**
   * Create a bot and have it join a meeting.
   */
  async createBot(
    meetingUrl: string,
    botName: string,
    avatarUrl?: string,
    webhookUrl?: string,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      meeting_url: meetingUrl,
      bot_name: botName,
      transcription_options: {
        provider: "meeting_captions",
      },
    };

    if (webhookUrl) {
      payload.real_time_transcription = {
        destination_url: `${webhookUrl}/api/webhooks/recall`,
      };
    }

    if (avatarUrl) {
      payload.output_media = {
        camera: {
          kind: "webpage",
          config: { url: avatarUrl },
        },
      };
    }

    return this.request<Record<string, unknown>>("POST", "/bot", payload);
  }

  /**
   * Get the current status of a bot.
   */
  async getBotStatus(botId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", `/bot/${botId}`);
  }

  /**
   * Send a chat message in the meeting.
   */
  async sendChatMessage(botId: string, message: string): Promise<void> {
    await this.request("POST", `/bot/${botId}/send_chat_message`, { message });
  }

  /**
   * Send audio to the meeting so the bot "speaks".
   * @param audioBase64 Base64-encoded audio data
   * @param kind Audio format (default: "mp3")
   */
  async outputAudio(
    botId: string,
    audioBase64: string,
    kind: string = "mp3",
  ): Promise<void> {
    await this.request("POST", `/bot/${botId}/output_audio`, {
      data: audioBase64,
      kind,
    });
  }

  /**
   * Remove the bot from the meeting.
   */
  async leaveMeeting(botId: string): Promise<void> {
    await this.request("DELETE", `/bot/${botId}`);
  }

  /**
   * Set or update the bot's output media (avatar webpage).
   */
  async setOutputMedia(
    botId: string,
    webpageUrl: string,
  ): Promise<void> {
    await this.request("PATCH", `/bot/${botId}`, {
      output_media: {
        camera: {
          kind: "webpage",
          config: { url: webpageUrl },
        },
      },
    });
  }
}
