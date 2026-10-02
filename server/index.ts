import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { loadConfig } from "./config.js";
import { RecallService } from "./services/recall.js";
import { SessionManager } from "./services/session-manager.js";
import { SpeakerService } from "./services/speaker.js";
import { LLMService } from "./services/llm.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { createControlRouter } from "./routes/control.js";
import { createWebhooksRouter } from "./routes/webhooks.js";
import { createHeygenRouter } from "./routes/heygen.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import { SessionState } from "./types.js";
import { detectDirectAddress, buildNudgeMessage } from "./services/address-detector.js";
import { decideNudge, type LastNudge } from "./services/nudge-decision.js";

// ──────────────────────────────────────────────
// Config & Services
// ──────────────────────────────────────────────

const config = loadConfig();

const recall = new RecallService(config);
const sessionManager = new SessionManager();
const speaker = new SpeakerService(config, recall);
const llm = new LLMService(config);

// ──────────────────────────────────────────────
// WebSocket client registry
// ──────────────────────────────────────────────

/** Map of session ID → set of connected WebSocket clients */
const wsClients = new Map<string, Set<WebSocket>>();

/**
 * Broadcast a JSON message to all WS clients subscribed to a session.
 */
export function broadcast(sessionId: string, message: unknown): void {
  const clients = wsClients.get(sessionId);
  if (!clients) return;
  const payload = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// ──────────────────────────────────────────────
// Express app
// ──────────────────────────────────────────────

const app = express();

app.use(express.json({ limit: "10mb" }));

// Serve client static files (built by Vite)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../client/dist")));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount routes
app.use(
  "/api/sessions",
  createSessionsRouter(config, sessionManager, recall, llm),
);
app.use(
  "/api/sessions",
  createControlRouter(config, sessionManager, recall, speaker, llm, broadcast, sendAvatarCommand),
);
app.use(
  "/api/webhooks",
  createWebhooksRouter(sessionManager, broadcast),
);
app.use(
  "/api/heygen",
  createHeygenRouter(config),
);

// Dashboard-specific routes (paper analyze, config defaults, etc.)
app.use(
  "/api",
  createDashboardRouter(config, sessionManager, llm),
);

// Serve dashboard static files (built by Vite)
app.use("/dashboard", express.static(path.join(__dirname, "../dashboard/dist")));
// SPA fallback — serve index.html for all /dashboard/* routes
app.get("/dashboard/*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../dashboard/dist/index.html"));
});

// ──────────────────────────────────────────────
// HTTP + WebSocket server
// ──────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

// Separate WSS for Recall.ai real-time data
const recallWss = new WebSocketServer({ noServer: true });

// Avatar command WebSocket (bidirectional):
//   server → client: speak, raise-hand, interrupt, mute, ...
//   client → server: { type: "avatar_speaking", speaking: boolean }
const avatarCmdWss = new WebSocketServer({ noServer: true });
const avatarCmdClients = new Set<WebSocket>();

// ──────────────────────────────────────────────
// Transcript nudge state (in-memory, per session)
// ──────────────────────────────────────────────

interface NudgeState {
  /** True while a guard timer is pending for this session (debounce). */
  pending: boolean;
  /** The last nudge dispatched for this session, for duplicate suppression. */
  lastNudge: LastNudge | null;
}

/** Per-session nudge bookkeeping, keyed by session id. */
const nudgeStates = new Map<string, NudgeState>();

/**
 * Epoch ms when the HeyGen avatar last started speaking, as reported by the
 * client over /ws/avatar-commands.
 *
 * SINGLE-SESSION CONSTRAINT: this is one module-level timestamp (not per
 * session), and sendAvatarCommand() below fans every command out to ALL
 * connected avatar clients with no session routing. The whole nudge path
 * therefore assumes exactly one active meeting/avatar at a time, which is how
 * the rest of the server operates (recallWss and recoverSessions both resolve a
 * single active session). This satisfies issue #2's "noisy multi-person"
 * criterion (many speakers in ONE meeting). It does NOT support multiple
 * concurrent meetings: with two sessions, one avatar's speech would suppress the
 * other's nudge and a nudge computed for session A would be spoken to every
 * avatar. Supporting concurrent meetings would require keying this timestamp by
 * session and routing sendAvatarCommand per session; that is out of scope here.
 *
 * FAILURE MODE (socket drop): this signal depends on the client reporting
 * avatar_speaking over /ws/avatar-commands. If that socket is down at the moment
 * HeyGen answers on its own, the server observes no speech and may still fire the
 * nudge, producing a double response. This is a safety-net feature layered on top
 * of HeyGen's native behavior, so the degraded case is an extra prompt rather than
 * a missed answer; it is accepted rather than guarded with a server-side fallback.
 */
let avatarLastSpeakStartedAt: number | null = null;

function getNudgeState(sessionId: string): NudgeState {
  let state = nudgeStates.get(sessionId);
  if (!state) {
    state = { pending: false, lastNudge: null };
    nudgeStates.set(sessionId, state);
  }
  return state;
}

// Dashboard WebSocket — receives ALL session events (transcript, state, status)
const dashboardWss = new WebSocketServer({ noServer: true });
const dashboardClients = new Set<WebSocket>();

/** Broadcast a message to all connected dashboard clients */
function broadcastDashboard(message: unknown): void {
  const payload = JSON.stringify(message);
  for (const ws of dashboardClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

dashboardWss.on("connection", (ws: WebSocket) => {
  console.log("[DASHBOARD-WS] Client connected");
  dashboardClients.add(ws);

  // Send current active sessions on connect
  const sessions = sessionManager.listSessions();
  const active = sessions.find(s => s.state !== "DONE");
  if (active) {
    ws.send(JSON.stringify({ type: "state_change", state: active.state }));
    // Send existing transcript
    for (const seg of active.transcript) {
      ws.send(JSON.stringify({ type: "transcript", speaker: seg.speaker, text: seg.text, timestamp: seg.timestamp }));
    }
  }

  ws.on("close", () => {
    console.log("[DASHBOARD-WS] Client disconnected");
    dashboardClients.delete(ws);
  });
  ws.on("error", (err) => {
    console.error("[DASHBOARD-WS] Error:", err.message);
  });
});

avatarCmdWss.on("connection", (ws: WebSocket) => {
  console.log("[AVATAR-CMD] Client connected");
  avatarCmdClients.add(ws);

  // Reverse channel: the client reports whether the HeyGen avatar is speaking
  // so the nudge guard can tell when HeyGen already answered. The socket stays
  // fully functional for outbound commands; this only adds an inbound handler.
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg?.type === "avatar_speaking") {
        if (msg.speaking) {
          avatarLastSpeakStartedAt = Date.now();
          console.log("[Nudge] Avatar started speaking (reported by client)");
        } else {
          console.log("[Nudge] Avatar stopped speaking (reported by client)");
        }
      }
    } catch (err) {
      console.error("[AVATAR-CMD] Parse error:", (err as Error).message);
    }
  });

  ws.on("close", () => { console.log("[AVATAR-CMD] Client disconnected"); avatarCmdClients.delete(ws); });
  ws.on("error", (err) => { console.error("[AVATAR-CMD] Error:", err.message); });
});

// Fans a command out to ALL connected avatar clients. There is no per-session
// routing: this relies on the single-session constraint documented on
// avatarLastSpeakStartedAt above (one active meeting/avatar at a time).
function sendAvatarCommand(command: { type: string; text?: string; mode?: string }) {
  const payload = JSON.stringify(command);
  for (const client of avatarCmdClients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

/** Bot/system speakers that must never trigger detection (feedback-loop guard). */
const NON_HUMAN_SPEAKERS = new Set(["[SYSTEM]", "SYSTEM", "Kira"]);

/**
 * Run direct-address detection on a FINAL transcript segment and, when the
 * segment is addressed to Kira, schedule a guarded nudge. Only operates on
 * finalized segments; the caller must not pass partial segments.
 */
function maybeScheduleNudge(sessionId: string, speaker: string, text: string): void {
  const session = (() => {
    try {
      return sessionManager.getSession(sessionId);
    } catch {
      return undefined;
    }
  })();
  if (!session) return;

  // Resolve the per-session toggle against the env default.
  const enabled = session.config.transcriptNudgeEnabled ?? config.transcriptNudgeEnabled;
  if (!enabled) return;

  // Feedback-loop guard: never detect on bot/system speakers or the configured
  // bot name. The nudge prompt is spoken by the avatar (speaker "Kira") so it
  // can never be re-detected as an address.
  const botFirstToken = (session.config.personality?.name ?? session.botName ?? "")
    .split(/[\s(]/)[0]
    ?.trim();
  if (NON_HUMAN_SPEAKERS.has(speaker) || (botFirstToken && speaker === botFirstToken)) {
    return;
  }

  // Detect using the resolved bot name so a renamed bot is still matched by
  // name. "Kira" remains the baseline when no name resolves. This keeps the
  // detector symmetric with the feedback-loop exclusion above, which also uses
  // the configured name.
  const result = detectDirectAddress(text, { name: botFirstToken || undefined });
  if (!result.addressed) return;

  const state = getNudgeState(sessionId);
  // Debounce: ignore if a guard timer is already pending for this session.
  if (state.pending) {
    console.log(`[Nudge] Detection ignored (nudge already pending) for session ${sessionId}`);
    return;
  }

  const windowMs = session.config.transcriptNudgeWindowMs ?? config.transcriptNudgeWindowMs;
  const excerpt = result.excerpt;
  const detectionTime = Date.now();

  // Early duplicate check so we do not even start a timer for a repeat.
  if (
    state.lastNudge &&
    state.lastNudge.excerpt === excerpt &&
    detectionTime - state.lastNudge.time < windowMs
  ) {
    console.log(`[Nudge] Detection ignored (duplicate excerpt within window) for session ${sessionId}`);
    return;
  }

  console.log(`[Nudge] Direct address detected for session ${sessionId}; guard window ${windowMs}ms: "${excerpt}"`);
  state.pending = true;

  setTimeout(() => {
    state.pending = false;
    const decision = decideNudge({
      detectionTime,
      excerpt,
      lastAvatarSpeakStartedAt: avatarLastSpeakStartedAt,
      lastNudge: state.lastNudge,
      enabled: session.config.transcriptNudgeEnabled ?? config.transcriptNudgeEnabled,
      windowMs,
      now: Date.now(),
    });

    if (!decision.nudge) {
      if (decision.reason === "suppress-avatar-speaking") {
        console.log(`[Nudge] Suppressed (${decision.reason}): HeyGen already answered for session ${sessionId}`);
      } else {
        console.log(`[Nudge] Suppressed (${decision.reason}) for session ${sessionId}`);
      }
      return;
    }

    const message = buildNudgeMessage(excerpt);
    sendAvatarCommand({ type: "speak", text: message, mode: "message" });
    state.lastNudge = { excerpt, time: Date.now() };
    console.log(`[Nudge] Dispatched nudge for session ${sessionId}: ${message.substring(0, 80)}`);
  }, windowMs);
}

recallWss.on("connection", (ws: WebSocket) => {
  console.log("[RECALL-WS] Recall.ai connected for real-time streaming");

  // Broadcast bot connected status to dashboard
  broadcastDashboard({ type: "bot_status", status: "in_call_recording" });
  broadcastDashboard({ type: "heygen_status", status: "connected" });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const event = msg.event ?? msg.type ?? "unknown";

      if (event === "transcript.data" || event === "transcript.partial_data") {
        const words = msg.data?.data?.words ?? [];
        const text = words.map((w: { text: string }) => w.text).join(" ");
        const speaker = msg.data?.data?.participant?.name ?? "Unknown";
        const isPartial = event === "transcript.partial_data";

        if (text.trim()) {
          console.log(`  [${speaker}]${isPartial ? " (partial)" : ""}: ${text}`);

          // Find active session and add transcript
          const sessions = sessionManager.listSessions();
          for (const session of sessions) {
            // Auto-transition from JOINING to LISTENING when we get first transcript
            if (session.state === "JOINING" || session.state === "PREPARING" || session.state === "IDLE") {
              try {
                sessionManager.updateState(session.id, "LISTENING" as any);
                broadcast(session.id, { type: "state_change", state: "LISTENING" });
                console.log(`  [Session] ${session.id}: auto-transitioned to LISTENING (first transcript received)`);
              } catch { /* ignore state transition errors */ }
            }

            if (session.state === "LISTENING" || session.state === "HAND_RAISED" || session.state === "SPEAKING" || session.state === "JOINING") {
              if (!isPartial) {
                sessionManager.addTranscript(session.id, {
                  speaker,
                  text,
                  timestamp: Date.now(),
                });
                // Broadcast to avatar clients
                broadcast(session.id, {
                  type: "transcript",
                  speaker,
                  text,
                });
                // Broadcast to dashboard clients
                broadcastDashboard({
                  type: "transcript",
                  speaker,
                  text,
                  timestamp: Date.now(),
                });
                // Direct-address detection + guarded nudge (FINAL segments only)
                maybeScheduleNudge(session.id, speaker, text);
              }
            }
          }
        }
      } else {
        console.log(`[RECALL-WS] Event: ${event}`);
      }
    } catch (err) {
      console.error("[RECALL-WS] Parse error:", (err as Error).message);
    }
  });

  ws.on("close", () => {
    console.log("[RECALL-WS] Recall.ai disconnected");
  });

  ws.on("error", (err) => {
    console.error("[RECALL-WS] Error:", err.message);
  });
});

// Handle upgrade requests to route /ws/sessions/:id or /ws/recall
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Recall.ai real-time streaming endpoint
  if (url.pathname === "/ws/recall") {
    recallWss.handleUpgrade(req, socket, head, (ws) => {
      recallWss.emit("connection", ws);
    });
    return;
  }

  if (url.pathname === "/ws/avatar-commands") {
    avatarCmdWss.handleUpgrade(req, socket, head, (ws) => {
      avatarCmdWss.emit("connection", ws);
    });
    return;
  }

  // Dashboard WebSocket endpoint
  if (url.pathname === "/ws/dashboard") {
    dashboardWss.handleUpgrade(req, socket, head, (ws) => {
      dashboardWss.emit("connection", ws);
    });
    return;
  }

  // Avatar webpage endpoint
  const match = url.pathname.match(/^\/ws\/sessions\/([^/]+)$/);
  if (!match) {
    socket.destroy();
    return;
  }

  const sessionId = match[1]!;

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, sessionId);
  });
});

wss.on("connection", (ws: WebSocket, sessionId: string) => {
  console.log(`[WS] Client connected for session ${sessionId}`);

  // Register client
  if (!wsClients.has(sessionId)) {
    wsClients.set(sessionId, new Set());
  }
  wsClients.get(sessionId)!.add(ws);

  // Send current state on connect
  try {
    const session = sessionManager.getSession(sessionId);
    ws.send(
      JSON.stringify({ type: "state_change", state: session.state }),
    );
  } catch {
    // Session may not exist yet — that's fine
  }

  ws.on("close", () => {
    console.log(`[WS] Client disconnected from session ${sessionId}`);
    const clients = wsClients.get(sessionId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        wsClients.delete(sessionId);
      }
    }
  });

  ws.on("error", (err) => {
    console.error(`[WS] Error for session ${sessionId}:`, err.message);
  });
});

// ──────────────────────────────────────────────
// Session Recovery
// ──────────────────────────────────────────────

async function recoverSessions(): Promise<number> {
  try {
    const activeBots = await recall.listActiveBots();
    if (!activeBots.length) {
      console.log("[Recovery] No active bots found");
      return 0;
    }

    // Sort by created_at descending — most recent first
    activeBots.sort(
      (a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const bot = activeBots[0];

    if (activeBots.length > 1) {
      const skipped = activeBots
        .slice(1)
        .map((b: any) => b.id.slice(0, 8))
        .join(", ");
      console.warn(
        `[Recovery] Found ${activeBots.length} active bots — recovering most recent only. Skipped: ${skipped}`,
      );
    }

    const meetingUrl = bot.meeting_url ?? "unknown";
    const botName = bot.bot_name ?? config.defaultBotName;
    const session = sessionManager.createSession(meetingUrl, botName, {});
    session.botId = bot.id;
    session.state = SessionState.LISTENING;
    console.log(
      `[Recovery] Recovered session ${session.id} for bot ${bot.id.slice(0, 8)} in ${meetingUrl}`,
    );
    return 1;
  } catch (err) {
    console.error("[Recovery] Failed to recover sessions:", err);
    return 0;
  }
}

// ──────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────

// Avatar speak command
app.post("/api/avatar/speak", (req, res) => {
  const { text, mode } = req.body as { text?: string; mode?: string };
  if (!text) { res.status(400).json({ error: "No text" }); return; }
  console.log(`[AVATAR-SPEAK] ${text.substring(0, 80)}...`);
  sendAvatarCommand({ type: "speak", text, mode: mode ?? "message" });
  res.json({ status: "sent", connectedClients: avatarCmdClients.size });
});

// Avatar mute — mutes the HeyGen video element on the client page
// ⚠️ EXPERIMENTAL: Muting via videoElement.muted is untested with Recall.ai page audio capture
app.post("/api/avatar/mute", (_req, res) => {
  console.log("[AVATAR] ⚠️ Muting avatar (EXPERIMENTAL — untested with Recall.ai page audio capture)");
  sendAvatarCommand({ type: "mute" });
  broadcastDashboard({ type: "mute_status", muted: true });
  res.json({ status: "muted", connectedClients: avatarCmdClients.size });
});

// Avatar unmute — unmutes the HeyGen video element on the client page
app.post("/api/avatar/unmute", (_req, res) => {
  console.log("[AVATAR] Unmuting avatar");
  sendAvatarCommand({ type: "unmute" });
  broadcastDashboard({ type: "mute_status", muted: false });
  res.json({ status: "unmuted", connectedClients: avatarCmdClients.size });
});

// Avatar raise hand
app.post("/api/avatar/raise-hand", async (req, res) => {
  const { botId, message } = req.body as { botId?: string; message?: string };
  console.log("[AVATAR] Raising hand...");
  sendAvatarCommand({ type: "raise-hand" });
  if (botId) {
    try { await recall.sendChatMessage(botId, message ?? "✋ Kira would like to ask a question"); }
    catch (err) { console.error("[AVATAR] Chat failed:", err); }
  }
  res.json({ status: "hand_raised" });
});

// Avatar lower hand
app.post("/api/avatar/lower-hand", (_req, res) => {
  sendAvatarCommand({ type: "lower-hand" });
  res.json({ status: "hand_lowered" });
});

// Start server with session recovery
(async () => {
  const recovered = await recoverSessions();

  server.listen(config.port, () => {
    const recoveredLine = recovered > 0
      ? `║  Recovered → 1 active session from Recall.ai ║\n`
      : "";
    console.log(`
╔══════════════════════════════════════════════╗
║   🤖  Kira — AI Meeting Bot Server          ║
╠══════════════════════════════════════════════╣
║  HTTP   → http://localhost:${String(config.port).padEnd(5)}            ║
║  WS     → ws://localhost:${String(config.port).padEnd(5)}/ws/sessions/  ║
║  Webhook→ ${config.webhookBaseUrl.padEnd(33)}║
${recoveredLine}╚══════════════════════════════════════════════╝
    `);
  });
})();

export { config, sessionManager, recall, speaker, llm };

// Debug endpoint — client reports HeyGen errors here
app.post("/api/heygen/debug", (req, res) => {
  const { error, stage, details } = req.body as { error?: string; stage?: string; details?: string };
  console.error(`[HEYGEN-DEBUG] Stage: ${stage} | Error: ${error} | Details: ${details}`);
  res.json({ received: true });
});
