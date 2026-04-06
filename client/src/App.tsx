import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { LiveAvatarContextProvider } from "./contexts/LiveAvatarContext";
import HeyGenAvatar from "./components/HeyGenAvatar";
import { useServerWS } from "./hooks/useServerWS";
import Avatar from "./components/Avatar";
import HandRaised from "./components/HandRaised";
import Speaking from "./components/Speaking";
import StatusBar from "./components/StatusBar";
import { reportDebug } from "./debug";

export type BotState =
  | "JOINING"
  | "LISTENING"
  | "HAND_RAISED"
  | "SPEAKING"
  | "DONE"
  | "ERROR";

const STATUS_TEXT: Record<BotState, string> = {
  JOINING: "Joining...",
  LISTENING: "Listening",
  HAND_RAISED: "Hand Raised ✋",
  SPEAKING: "Speaking 🎤",
  DONE: "Done",
  ERROR: "Error",
};

function getParams(): { sessionId: string; avatar: string; botName: string; bgImage: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get("sessionId") ?? "",
    avatar: params.get("avatar") ?? "",
    botName: params.get("botName") ?? "Kira (AI Principal SA)",
    bgImage: params.get("bgImage") ?? "",
  };
}

export default function App() {
  const { sessionId, avatar, botName, bgImage } = useMemo(getParams, []);
  const { state, connected } = useServerWS(sessionId);
  const [heygenFailed, setHeygenFailed] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  // Reference to the HeyGen session — set by HeyGenAvatar when ready
  const heygenSessionRef = useRef<any>(null);

  const botState: BotState = (state as BotState) || "JOINING";
  const statusText = STATUS_TEXT[botState] ?? botState;

  const handleHeygenError = useCallback((error: string) => {
    console.warn("[App] HeyGen error, falling back:", error);
    reportDebug("FALLBACK_TRIGGERED", error);
    setHeygenFailed(true);
  }, []);

  // Listen for speak/raise-hand commands from control server
  useEffect(() => {
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/avatar-commands`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[AvatarCmd] Connected");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log("[AvatarCmd]", msg.type, msg.text?.substring(0, 40));

          if (msg.type === "speak" && msg.text && heygenSessionRef.current) {
            if (msg.mode === "exact") {
              heygenSessionRef.current.repeat(msg.text);
            } else {
              heygenSessionRef.current.message(msg.text);
            }
            setHandRaised(false); // Lower hand after speaking
          } else if (msg.type === "inject-context" && msg.text && heygenSessionRef.current) {
            // Context injection — send to HeyGen LLM for silent absorption
            heygenSessionRef.current.message(msg.text);
            console.log("[AvatarCmd] Context injected:", msg.text.substring(0, 60));
          } else if (msg.type === "interrupt" && heygenSessionRef.current) {
            heygenSessionRef.current.interrupt();
          } else if (msg.type === "raise-hand") {
            setHandRaised(true);
          } else if (msg.type === "lower-hand") {
            setHandRaised(false);
          } else if (msg.type === "mute") {
            // ⚠️ EXPERIMENTAL: Mute Kira's voice output by muting the video element.
            // Recall.ai captures page audio — muted page = silence in Zoom.
            // HeyGen still hears meeting audio (input is separate from output).
            const video = document.querySelector('video');
            if (video) {
              video.muted = true;
              console.log("[AvatarCmd] ⚠️ Video element muted (EXPERIMENTAL — untested with Recall.ai)");
            } else {
              console.warn("[AvatarCmd] No video element found to mute");
            }
          } else if (msg.type === "unmute") {
            const video = document.querySelector('video');
            if (video) {
              video.muted = false;
              console.log("[AvatarCmd] Video element unmuted");
            } else {
              console.warn("[AvatarCmd] No video element found to unmute");
            }
          }
        } catch (err) {
          console.error("[AvatarCmd] Parse error:", err);
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };

      ws.onerror = () => {};
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // HeyGen live avatar mode
  if (!heygenFailed) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: bgImage
            ? `url(${bgImage}) center/cover no-repeat`
            : "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          overflow: "hidden",
        }}
      >
        {/* Zoom-style raised hand overlay */}
        {handRaised && (
          <div
            style={{
              position: "fixed",
              top: 12,
              left: 12,
              zIndex: 99999,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(0, 0, 0, 0.8)",
                borderRadius: 8,
                padding: "8px 12px",
                gap: 8,
              }}
            >
              <img
                src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/270b.svg"
                alt="✋"
                style={{ width: 22, height: 22 }}
              />
              <span style={{ color: "white", fontSize: 16, fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 500 }}>1</span>
            </div>
          </div>
        )}

        <LiveAvatarContextProvider onFatalError={handleHeygenError}>
          <HeyGenAvatar onError={handleHeygenError} sessionRef={heygenSessionRef} />
        </LiveAvatarContextProvider>
      </div>
    );
  }

  // Fallback: static avatar
  return (
    <div className="app-container">
      <div className="avatar-stage">
        <Avatar avatarUrl={avatar} botName={botName} speaking={botState === "SPEAKING"} />
        <div className={`overlay-layer ${botState === "HAND_RAISED" ? "fade-in" : "fade-out"}`}>
          <HandRaised visible={botState === "HAND_RAISED"} />
        </div>
        <div className={`overlay-layer ${botState === "SPEAKING" ? "fade-in" : "fade-out"}`}>
          <Speaking visible={botState === "SPEAKING"} />
        </div>
      </div>
      <StatusBar botName={botName} statusText={statusText} connected={connected} />
    </div>
  );
}
