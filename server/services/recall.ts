import type { Config } from "../config.js";
import { type Platform } from "./platform.js";

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
    platform: Platform = "zoom",
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
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

    // Carry the join URL in the platform-specific field. Zoom keeps the
    // existing flat `meeting_url`; Teams uses `microsoft_teams_join_url`.
    if (platform === "teams") {
      payload.microsoft_teams_join_url = meetingUrl;
    } else {
      payload.meeting_url = meetingUrl;
    }

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
   * List bots that are currently active in a call.
   * Fetches recent bots from Recall.ai and filters by latest status.
   */
  async listActiveBots(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/bot/?limit=20`, {
      headers: { Authorization: `Token ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`Recall listBots failed: ${res.status}`);
    const data = (await res.json()) as any;
    const bots = data.results ?? [];

    // Filter to only bots currently in a call
    const activeStatuses = [
      "in_call_recording",
      "in_call_not_recording",
      "in_waiting_room",
      "joining_call",
    ];
    return bots.filter((bot: any) => {
      const changes = bot.status_changes ?? [];
      if (!changes.length) return false;
      const latest = changes[changes.length - 1].code;
      return activeStatuses.includes(latest);
    });
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
