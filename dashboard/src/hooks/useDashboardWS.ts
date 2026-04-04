import { useEffect, useRef, useCallback } from 'react';
import type { DashboardAction } from '../types';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

export function useDashboardWS(
  sessionId: string | null,
  dispatch: React.Dispatch<DashboardAction>,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!sessionId) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/sessions/${sessionId}`;

    console.log(`[WS] Connecting to ${url}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      attemptRef.current = 0;
      dispatch({ type: 'WS_CONNECTED' });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'state_change':
            dispatch({ type: 'STATE_CHANGED', state: msg.state });
            break;
          case 'transcript':
            dispatch({
              type: 'TRANSCRIPT_SEGMENT',
              segment: {
                speaker: msg.speaker,
                text: msg.text,
                timestamp: msg.timestamp ?? Date.now(),
              },
            });
            break;
          case 'bot_status':
            dispatch({ type: 'BOT_STATUS_CHANGED', status: msg.status });
            break;
          case 'heygen_status':
            dispatch({ type: 'HEYGEN_STATUS_CHANGED', status: msg.status });
            break;
          case 'error':
            dispatch({ type: 'ERROR_ADDED', message: msg.message });
            break;
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      dispatch({ type: 'WS_DISCONNECTED' });
      // Reconnect with exponential backoff
      const delay = RECONNECT_DELAYS[Math.min(attemptRef.current, RECONNECT_DELAYS.length - 1)];
      attemptRef.current++;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      ws.close();
    };
  }, [sessionId, dispatch]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return wsRef;
}
