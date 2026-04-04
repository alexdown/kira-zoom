import { Router, type Request, type Response } from "express";
import type { Config } from "../config.js";

export function createHeygenRouter(config: Config): Router {
  const router = Router();

  /**
   * POST /api/heygen/session
   * Creates a HeyGen LiveAvatar session token.
   * The client uses this token to initialize a LiveAvatarSession.
   */
  router.post("/session", async (_req: Request, res: Response) => {
    try {
      const { heygenApiKey, heygenAvatarId, heygenVoiceId, heygenContextId } =
        config;

      if (!heygenApiKey) {
        res.status(500).json({ error: "HEYGEN_API_KEY not configured" });
        return;
      }

      console.log("[HeyGen] Creating LiveAvatar session...");

      const response = await fetch(
        "https://api.liveavatar.com/v1/sessions/token",
        {
          method: "POST",
          headers: {
            "X-API-KEY": heygenApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "FULL",
            avatar_id: heygenAvatarId,
            avatar_persona: {
              voice_id: heygenVoiceId,
              context_id: heygenContextId,
              language: "en",
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[HeyGen] API error (${response.status}): ${errorText}`,
        );
        res
          .status(response.status)
          .json({ error: `HeyGen API error: ${errorText}` });
        return;
      }

      const data = (await response.json()) as {
        code: number;
        data: { session_id: string; session_token: string };
        message: string;
      };

      console.log(
        `[HeyGen] Session created: ${data.data.session_id}`,
      );

      res.json({
        session_id: data.data.session_id,
        session_token: data.data.session_token,
      });
    } catch (err) {
      console.error("[HeyGen] Failed to create session:", err);
      res.status(500).json({
        error:
          err instanceof Error ? err.message : "Failed to create HeyGen session",
      });
    }
  });

  return router;
}
