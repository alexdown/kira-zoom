import { reportDebug } from "../debug";
import { SessionState } from "@heygen/liveavatar-web-sdk";
import { useEffect, useRef, useState } from "react";
import { useLiveAvatarContext } from "../contexts/LiveAvatarContext";
import { useLiveAvatarActions } from "../hooks/useLiveAvatarActions";
import { useSession } from "../hooks/useSession";
import { setupChromaKey } from "../chromaKey";

/** Read chroma key tuning params from URL, falling back to HeyGen defaults */
function getChromaKeyOptions() {
  const params = new URLSearchParams(window.location.search);
  return {
    minHue: Number(params.get("minHue") ?? 60),
    maxHue: Number(params.get("maxHue") ?? 180),
    minSaturation: Number(params.get("minSat") ?? 0.1),
    threshold: Number(params.get("threshold") ?? 1.0),
  };
}

interface HeyGenAvatarProps {
  onError: (error: string) => void;
  sessionRef: React.MutableRefObject<any>;
}

export default function HeyGenAvatar({ onError, sessionRef }: HeyGenAvatarProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasInitialized = useRef(false);
  const chromaCleanupRef = useRef<(() => void) | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const { isAvatarTalking, sessionError, sessionRef: heygenSession } = useLiveAvatarContext();
  const { startListening, unmuteMic, isUserTalking } = useLiveAvatarActions();
  const { sessionState, isStreamReady, startSession, attachElement } =
    useSession();

  const isConnecting = sessionState === SessionState.CONNECTING;

  // Expose HeyGen session to parent for speak commands
  useEffect(() => {
    if (isStreamReady && heygenSession.current) {
      sessionRef.current = heygenSession.current;
    }
  }, [isStreamReady, heygenSession, sessionRef]);

  // Attach video element when stream is ready
  useEffect(() => {
    if (isStreamReady && videoRef.current) {
      attachElement(videoRef.current);
    }
  }, [isStreamReady, attachElement]);

  // Start chroma key processing when stream is ready
  useEffect(() => {
    if (isStreamReady && videoRef.current && canvasRef.current) {
      // Stop any previous chroma key loop
      if (chromaCleanupRef.current) {
        chromaCleanupRef.current();
      }
      const options = getChromaKeyOptions();
      reportDebug("chromaKey", `starting: minHue=${options.minHue} maxHue=${options.maxHue} minSat=${options.minSaturation} threshold=${options.threshold}`);
      chromaCleanupRef.current = setupChromaKey(videoRef.current, canvasRef.current, options);
    }

    return () => {
      if (chromaCleanupRef.current) {
        chromaCleanupRef.current();
        chromaCleanupRef.current = null;
      }
    };
  }, [isStreamReady]);

  // Report errors to parent for fallback
  useEffect(() => {
    if (sessionError) {
      onError(sessionError);
    }
  }, [sessionError, onError]);

  useEffect(() => {
    if (micError) {
      onError(micError);
    }
  }, [micError, onError]);

  // Request mic permission, start session, and enable mic for user
  useEffect(() => {
    if (sessionState !== SessionState.INACTIVE || hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    async function initializeSession() {
      try {
        // Request mic permission
        // In Recall.ai bot browser this is auto-accepted
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        // Start the HeyGen session
        reportDebug("session", "starting");
        await startSession();
        reportDebug("session", "started");

        // Enable voice chat — avatar listens to mic audio + responds
        reportDebug("voice", "startListening");
        await startListening();
        reportDebug("voice", "unmuteMic");
        await unmuteMic();
        reportDebug("voice", "ready");
      } catch (error) {
        console.error("[HeyGen] Session initialization error:", error);
        const msg =
          error instanceof Error
            ? error.message
            : "Failed to initialize session.";
        reportDebug("init_error", msg);
        setMicError(msg);
      }
    }

    void initializeSession();
  }, [sessionState, startSession, startListening, unmuteMic]);

  return (
    <>
      {/* Hidden video element — HeyGen stream attaches here */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: "none",
        }}
      />

      {/* Chroma-keyed canvas — displayed full screen with transparent background */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Loading/Connecting State */}
      {!isStreamReady && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 80,
                height: 80,
                border: "4px solid #8b5cf6",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <p
              style={{
                fontSize: 20,
                color: "#cbd5e1",
                fontFamily: "sans-serif",
              }}
            >
              {isConnecting
                ? "Connecting to avatar..."
                : "Starting avatar session..."}
            </p>
          </div>
        </div>
      )}

      {/* Speaking Indicators */}
      {isStreamReady && (
        <div
          style={{
            position: "absolute",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {isAvatarTalking && (
            <div
              style={{
                padding: "8px 16px",
                borderRadius: 9999,
                background: "rgba(139, 92, 246, 0.9)",
                color: "white",
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 8,
                backdropFilter: "blur(8px)",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: "white",
                  borderRadius: "50%",
                  animation: "pulse-dot 1.5s ease-in-out infinite",
                }}
              />
              Kira speaking
            </div>
          )}
          {isUserTalking && (
            <div
              style={{
                padding: "8px 16px",
                borderRadius: 9999,
                background: "rgba(16, 185, 129, 0.9)",
                color: "white",
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 8,
                backdropFilter: "blur(8px)",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: "white",
                  borderRadius: "50%",
                  animation: "pulse-dot 1.5s ease-in-out infinite",
                }}
              />
              Listening
            </div>
          )}
        </div>
      )}
    </>
  );
}
