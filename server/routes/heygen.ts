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

  /**
   * GET /api/heygen/context
   * Fetch the current LiveAvatar context (prompt, opening_text, etc.)
   */
  router.get("/context", async (_req: Request, res: Response) => {
    try {
      const { heygenApiKey, heygenContextId } = config;

      if (!heygenApiKey) {
        res.status(500).json({ error: "HEYGEN_API_KEY not configured" });
        return;
      }
      if (!heygenContextId) {
        res.status(500).json({ error: "HEYGEN_CONTEXT_ID not configured" });
        return;
      }

      console.log(`[HeyGen] Fetching context ${heygenContextId}...`);

      const response = await fetch(
        `https://api.liveavatar.com/v1/contexts/${heygenContextId}`,
        {
          method: "GET",
          headers: { "X-API-KEY": heygenApiKey },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[HeyGen] Context fetch error (${response.status}): ${errorText}`,
        );
        res
          .status(response.status)
          .json({ error: `HeyGen API error: ${errorText}` });
        return;
      }

      const data = await response.json();
      console.log(`[HeyGen] Context fetched successfully`);
      res.json(data);
    } catch (err) {
      console.error("[HeyGen] Failed to fetch context:", err);
      res.status(500).json({
        error:
          err instanceof Error ? err.message : "Failed to fetch HeyGen context",
      });
    }
  });

  /**
   * PATCH /api/heygen/context
   * Update the LiveAvatar context (name, prompt, opening_text — all required).
   */
  router.patch("/context", async (req: Request, res: Response) => {
    try {
      const { heygenApiKey, heygenContextId } = config;

      if (!heygenApiKey) {
        res.status(500).json({ error: "HEYGEN_API_KEY not configured" });
        return;
      }
      if (!heygenContextId) {
        res.status(500).json({ error: "HEYGEN_CONTEXT_ID not configured" });
        return;
      }

      const { name, prompt, opening_text } = req.body as {
        name?: string;
        prompt?: string;
        opening_text?: string;
      };

      if (!name || !prompt || !opening_text) {
        res.status(400).json({
          error: "name, prompt, and opening_text are all required",
        });
        return;
      }

      console.log(
        `[HeyGen] Updating context ${heygenContextId} (prompt: ${prompt.length} chars)...`,
      );

      const response = await fetch(
        `https://api.liveavatar.com/v1/contexts/${heygenContextId}`,
        {
          method: "PATCH",
          headers: {
            "X-API-KEY": heygenApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, prompt, opening_text }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[HeyGen] Context update error (${response.status}): ${errorText}`,
        );
        res
          .status(response.status)
          .json({ error: `HeyGen API error: ${errorText}` });
        return;
      }

      const data = await response.json();
      console.log(`[HeyGen] Context updated successfully`);
      res.json(data);
    } catch (err) {
      console.error("[HeyGen] Failed to update context:", err);
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : "Failed to update HeyGen context",
      });
    }
  });

  return router;
}
