import { useEffect, useRef, useState, useCallback } from "react";

interface WSState {
  state: string;
  lastEvent: unknown;
  connected: boolean;
}

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

export function useServerWS(sessionId: string): WSState {
  const [state, setState] = useState<string>("JOINING");
  const [lastEvent, setLastEvent] = useState<unknown>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retryMs = useRef(INITIAL_RETRY_MS);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current || !sessionId) return;

    // Build WebSocket URL relative to the page's host
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/sessions/${sessionId}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) return;
      setConnected(true);
      retryMs.current = INITIAL_RETRY_MS;
    };

    ws.onmessage = (event) => {
      if (unmounted.current) return;
      try {
        const data = JSON.parse(event.data);
        setLastEvent(data);

        if (data.type === "state_change" && typeof data.state === "string") {
          setState(data.state);
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror — reconnect handled there
      ws.close();
    };
  }, [sessionId]);

  const scheduleReconnect = useCallback(() => {
    if (unmounted.current) return;
    const delay = retryMs.current;
    retryMs.current = Math.min(retryMs.current * 2, MAX_RETRY_MS);
    retryTimer.current = setTimeout(() => connect(), delay);
  }, [connect]);

  useEffect(() => {
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      clearTimeout(retryTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { state, lastEvent, connected };
}
