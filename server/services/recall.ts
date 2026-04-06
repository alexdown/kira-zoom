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
  private webhookBaseUrl: string;
  private avatarPublicUrl: string;

  constructor(config: Config) {
    this.baseUrl = config.recallBaseUrl;
    this.apiKey = config.recallApiKey;
    this.webhookBaseUrl = config.webhookBaseUrl;
    this.avatarPublicUrl = config.avatarPublicUrl;
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
   * Uses the correct recording_config format (not the deprecated transcription_options).
   */
  async createBot(
    meetingUrl: string,
    botName: string,
    avatarUrl?: string,
    _webhookUrl?: string,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      meeting_url: meetingUrl,
      bot_name: botName,
      recording_config: {
        transcript: {
          provider: {
            recallai_streaming: {
              language_code: "en",
            },
          },
        },
        include_bot_in_recording: {
          audio: true,
        },
        realtime_endpoints: [
          {
            type: "websocket",
            url: `wss://${new URL(this.webhookBaseUrl).host}/ws/recall`,
            events: ["transcript.data", "transcript.partial_data"],
          },
        ],
      },
      variant: {
        zoom: "web_4_core",
        google_meet: "web_4_core",
        microsoft_teams: "web_4_core",
      },
    };

    if (avatarUrl) {
      payload.output_media = {
        camera: {
          kind: "webpage",
          config: { url: avatarUrl },
        },
      };
    }

    return this.request<Record<string, unknown>>("POST", "/bot/", payload);
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
    await this.request("POST", `/bot/${botId}/send_chat_message/`, { message });
  }

  /**
   * Send audio to the meeting so the bot "speaks".
   */
  async outputAudio(
    botId: string,
    audioBase64: string,
    kind: string = "mp3",
  ): Promise<void> {
    await this.request("POST", `/bot/${botId}/output_audio/`, {
      kind,
      b64_data: audioBase64,
    });
  }

  /**
   * Remove the bot from the meeting.
   * Note: endpoint is /leave_call/ not DELETE /bot/
   */
  async leaveMeeting(botId: string): Promise<void> {
    await this.request("POST", `/bot/${botId}/leave_call/`, {});
  }

  /**
   * Set or update the bot's output media (avatar webpage).
   */
  async setOutputMedia(
    botId: string,
    webpageUrl: string,
  ): Promise<void> {
    await this.request("POST", `/bot/${botId}/output_media/`, {
      camera: {
        kind: "webpage",
        config: { url: webpageUrl },
      },
    });
  }

  /**
   * Stop the bot's output media (camera off).
   * ⚠️ EXPERIMENTAL: This may kill the HeyGen session. Needs testing.
   * Uses DELETE /bot/{id}/output_media/ with body { "camera": true }
   */
  async stopOutputMedia(botId: string): Promise<void> {
    console.warn("[Recall] ⚠️ stopOutputMedia is EXPERIMENTAL — may kill HeyGen session");
    // DELETE with a body requires manual fetch since our helper doesn't distinguish
    const url = `${this.baseUrl}/bot/${botId}/output_media/`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: this.headers(),
      body: JSON.stringify({ camera: true }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Recall API DELETE /bot/${botId}/output_media/ failed (${res.status}): ${text}`,
      );
    }
  }

  /**
   * Start/restore the bot's output media (camera on).
   * ⚠️ EXPERIMENTAL: Re-enabling output_media after stopping it is untested.
   * Uses POST /bot/{id}/output_media/ with the avatar webpage config.
   */
  async startOutputMedia(botId: string, webpageUrl: string): Promise<void> {
    console.warn("[Recall] ⚠️ startOutputMedia is EXPERIMENTAL — re-enabling output_media after stop is untested");
    await this.request("POST", `/bot/${botId}/output_media/`, {
      camera: {
        kind: "webpage",
        config: { url: webpageUrl },
      },
    });
  }
}
