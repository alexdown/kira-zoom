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
  createControlRouter(config, sessionManager, recall, speaker, llm, broadcast),
);
app.use(
  "/api/webhooks",
  createWebhooksRouter(sessionManager, broadcast),
);
app.use(
  "/api/heygen",
  createHeygenRouter(config),
);

// ──────────────────────────────────────────────
// HTTP + WebSocket server
// ──────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

// Separate WSS for Recall.ai real-time data
const recallWss = new WebSocketServer({ noServer: true });

recallWss.on("connection", (ws: WebSocket) => {
  console.log("[RECALL-WS] Recall.ai connected for real-time streaming");

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
            if (session.state === "LISTENING" || session.state === "HAND_RAISED" || session.state === "SPEAKING") {
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
// Start
// ──────────────────────────────────────────────

server.listen(config.port, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   🤖  Kira — AI Meeting Bot Server          ║
╠══════════════════════════════════════════════╣
║  HTTP   → http://localhost:${String(config.port).padEnd(5)}            ║
║  WS     → ws://localhost:${String(config.port).padEnd(5)}/ws/sessions/  ║
║  Webhook→ ${config.webhookBaseUrl.padEnd(33)}║
╚══════════════════════════════════════════════╝
  `);
});

export { config, sessionManager, recall, speaker, llm };
