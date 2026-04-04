import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Live meeting duration timer.
 * Returns mm:ss string from a start timestamp.
 */
export function useMeetingTimer(startTimestamp: number | null): string {
  const [elapsed, setElapsed] = useState('00:00');
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const updateTimer = useCallback(() => {
    if (!startTimestamp) {
      setElapsed('00:00');
      return;
    }
    const diff = Math.floor((Date.now() - startTimestamp) / 1000);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    setElapsed(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
  }, [startTimestamp]);

  useEffect(() => {
    updateTimer();
    if (startTimestamp) {
      intervalRef.current = setInterval(updateTimer, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startTimestamp, updateTimer]);

  return elapsed;
}
