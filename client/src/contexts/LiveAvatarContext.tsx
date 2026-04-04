import { reportDebug } from "../debug";
import {
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";

// ============================================================================
// Types
// ============================================================================

interface LiveAvatarContextValue {
  sessionRef: React.RefObject<LiveAvatarSession | null>;
  sessionState: SessionState;
  isStreamReady: boolean;
  isUserTalking: boolean;
  isAvatarTalking: boolean;
  sessionError: string | null;
  startSession: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const LiveAvatarContext = createContext<LiveAvatarContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

const SESSION_CONFIG = {
  voiceChat: true,
  apiUrl: "https://api.liveavatar.com",
} as const;

interface ProviderProps {
  children: ReactNode;
  onFatalError: (error: string) => void;
}

export function LiveAvatarContextProvider({
  children,
  onFatalError,
}: ProviderProps) {
  const sessionRef = useRef<LiveAvatarSession | null>(null);

  // Session state
  const [sessionState, setSessionState] = useState<SessionState>(
    SessionState.INACTIVE,
  );
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Talking state
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);

  // Token state
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);

  // Fetch the session token from our backend
  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      try {
        const response = await fetch("/api/heygen/session", {
          method: "POST",
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Failed to get session token (${response.status}): ${text}`);
        }
        const data = await response.json();
        if (!cancelled) {
          reportDebug("token", "success", data.session_id);
          setSessionToken(data.session_token);
          setIsLoadingToken(false);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Failed to fetch session token";
          console.error("[LiveAvatar] Token fetch error:", msg);
          setIsLoadingToken(false);
          reportDebug("token_error", msg);
          onFatalError(msg);
        }
      }
    }

    fetchToken();
    return () => {
      cancelled = true;
    };
  }, [onFatalError]);

  // Initialize the LiveAvatarSession once we have the token
  useEffect(() => {
    if (sessionToken && !sessionRef.current) {
      sessionRef.current = new LiveAvatarSession(sessionToken, SESSION_CONFIG);
      setSessionReady(true);
    }
  }, [sessionToken]);

  const session = sessionRef.current;

  // Set up session event listeners and cleanup
  useEffect(() => {
    if (!session) return;

    session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
      setSessionState(state);
      if (state === SessionState.DISCONNECTED) {
        setIsStreamReady(false);
      }
    });
    session.on(SessionEvent.SESSION_STREAM_READY, () =>
      setIsStreamReady(true),
    );
    session.on(AgentEventsEnum.USER_SPEAK_STARTED, () =>
      setIsUserTalking(true),
    );
    session.on(AgentEventsEnum.USER_SPEAK_ENDED, () =>
      setIsUserTalking(false),
    );
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () =>
      setIsAvatarTalking(true),
    );
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () =>
      setIsAvatarTalking(false),
    );

    // Cleanup on unmount
    return () => {
      void session.stop();
      session.removeAllListeners();
      session.voiceChat.removeAllListeners();
    };
  }, [session]);

  // Start session
  const startSession = useCallback(async () => {
    try {
      setSessionError(null);
      if (!sessionRef.current) {
        throw new Error("Session is not initialized");
      }
      await sessionRef.current.start();
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to start session";
      console.error("[LiveAvatar] Error starting session:", e);
      setSessionError(errorMessage);
    }
  }, []);

  // Memoize context value
  const contextValue = useMemo<LiveAvatarContextValue>(
    () => ({
      sessionRef,
      sessionState,
      isStreamReady,
      isUserTalking,
      isAvatarTalking,
      sessionError,
      startSession,
    }),
    [
      sessionState,
      isStreamReady,
      isUserTalking,
      isAvatarTalking,
      sessionError,
      startSession,
    ],
  );

  // While loading token, show nothing (dark background from parent)
  if (isLoadingToken) return null;

  // If no session (token failed), parent will handle via onFatalError
  if (!sessionReady || !session) return null;

  return (
    <LiveAvatarContext.Provider value={contextValue}>
      {children}
    </LiveAvatarContext.Provider>
  );
}

// ============================================================================
// Consumer Hook
// ============================================================================

export function useLiveAvatarContext(): LiveAvatarContextValue {
  const context = useContext(LiveAvatarContext);

  if (context === null) {
    throw new Error(
      "useLiveAvatarContext must be used within a LiveAvatarContextProvider",
    );
  }

  return context;
}
