import { Router, type Request, type Response } from "express";
import type { SessionManager } from "../services/session-manager.js";
import { SessionState } from "../types.js";

/**
 * Recall.ai webhook handler.
 *
 * Recall sends real-time events to this endpoint. We use them to:
 *   - Stream transcript data to the session
 *   - Track bot status changes
 *   - Log participant events
 */
export function createWebhooksRouter(
  sessionManager: SessionManager,
  broadcast: (sessionId: string, message: unknown) => void,
): Router {
  const router = Router();

  // ── POST /recall — Handle Recall.ai webhook events

  router.post("/recall", (req: Request, res: Response) => {
    try {
      const event = req.body as {
        event: string;
        data: Record<string, unknown>;
      };

      if (!event || !event.event) {
        res.status(400).json({ error: "Invalid webhook payload" });
        return;
      }

      console.log(`[Webhook] Received event: ${event.event}`);

      // Find the session by bot ID from the event data
      const botId = (event.data?.bot_id ?? event.data?.id) as string | undefined;

      switch (event.event) {
        case "transcript.data": {
          handleTranscriptData(event.data, botId, sessionManager, broadcast);
          break;
        }

        case "bot.status_change": {
          handleBotStatusChange(event.data, botId, sessionManager, broadcast);
          break;
        }

        default: {
          // participant_events.* and any other events — just log
          if (event.event.startsWith("participant_events")) {
            console.log(
              `[Webhook] Participant event: ${event.event}`,
              JSON.stringify(event.data).slice(0, 200),
            );
          } else {
            console.log(
              `[Webhook] Unhandled event: ${event.event}`,
              JSON.stringify(event.data).slice(0, 200),
            );
          }
        }
      }

      // Always respond 200 to acknowledge receipt
      res.status(200).json({ received: true });
    } catch (err) {
      console.error("[Webhook] Error processing event:", (err as Error).message);
      // Still return 200 so Recall doesn't retry
      res.status(200).json({ received: true, error: (err as Error).message });
    }
  });

  return router;
}

// ── Event handlers ──────────────────────────────

function findSessionByBotId(
  botId: string | undefined,
  sessionManager: SessionManager,
) {
  if (!botId) return undefined;

  // Search through all sessions for one with this bot ID
  const sessions = sessionManager.listSessions();
  return sessions.find((s) => s.botId === botId);
}

function handleTranscriptData(
  data: Record<string, unknown>,
  botId: string | undefined,
  sessionManager: SessionManager,
  broadcast: (sessionId: string, message: unknown) => void,
) {
  const session = findSessionByBotId(botId, sessionManager);
  if (!session) {
    console.warn(`[Webhook] transcript.data: no session for bot ${botId}`);
    return;
  }

  // Extract transcript segments from the event
  // Recall sends: { data: { transcript: { speaker: ..., words: [...] } } }
  // or a simpler format depending on transcription provider
  const transcript = data.transcript as
    | { speaker?: string; words?: Array<{ text: string }> }
    | undefined;
  const speaker =
    (transcript?.speaker as string) ??
    (data.speaker as string) ??
    "Unknown";
  const words = transcript?.words as Array<{ text: string }> | undefined;
  const text =
    words?.map((w) => w.text).join(" ") ??
    (data.text as string) ??
    "";

  if (!text.trim()) return;

  const segment = {
    speaker,
    text: text.trim(),
    timestamp: Date.now(),
  };

  sessionManager.addTranscript(session.id, segment);

  // Broadcast to WS clients
  broadcast(session.id, {
    type: "transcript",
    segment,
  });

  console.log(
    `[Webhook] ${session.id}: ${speaker}: "${text.trim().slice(0, 80)}"`,
  );
}

function handleBotStatusChange(
  data: Record<string, unknown>,
  botId: string | undefined,
  sessionManager: SessionManager,
  broadcast: (sessionId: string, message: unknown) => void,
) {
  const session = findSessionByBotId(botId, sessionManager);
  if (!session) {
    console.warn(`[Webhook] bot.status_change: no session for bot ${botId}`);
    return;
  }

  const status = data.status as Record<string, string> | undefined;
  const code = status?.code ?? (data.code as string) ?? "unknown";

  console.log(`[Webhook] ${session.id}: bot status → ${code}`);

  // Map Recall bot status to session state
  switch (code) {
    case "joining_call":
      // Bot is in the process of joining
      break;

    case "in_call_not_recording":
    case "in_call_recording":
      // Bot is in the meeting — transition to LISTENING if currently JOINING
      if (session.state === SessionState.JOINING) {
        try {
          sessionManager.updateState(session.id, SessionState.LISTENING);
          broadcast(session.id, {
            type: "state_change",
            state: SessionState.LISTENING,
          });
          console.log(`[Webhook] ${session.id}: now LISTENING`);
        } catch (err) {
          console.warn(
            `[Webhook] ${session.id}: state transition error:`,
            (err as Error).message,
          );
        }
      }
      break;

    case "call_ended":
    case "done":
    case "fatal": {
      // Bot left or meeting ended — transition to DONE
      try {
        if (
          session.state !== SessionState.LEAVING &&
          session.state !== SessionState.DONE
        ) {
          sessionManager.updateState(session.id, SessionState.LEAVING);
        }
        if (session.state !== SessionState.DONE) {
          sessionManager.updateState(session.id, SessionState.DONE);
        }
        broadcast(session.id, {
          type: "state_change",
          state: SessionState.DONE,
        });
        console.log(`[Webhook] ${session.id}: now DONE (${code})`);
      } catch (err) {
        console.warn(
          `[Webhook] ${session.id}: state transition error:`,
          (err as Error).message,
        );
      }
      break;
    }

    default:
      console.log(`[Webhook] ${session.id}: unhandled bot status: ${code}`);
  }

  // Broadcast raw status for the avatar
  broadcast(session.id, {
    type: "bot_status",
    status: code,
  });
}
