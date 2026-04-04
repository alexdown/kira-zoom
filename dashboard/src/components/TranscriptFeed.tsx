import { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '../types';

interface TranscriptFeedProps {
  segments: TranscriptSegment[];
  autoScroll: boolean;
}

export function TranscriptFeed({ segments, autoScroll }: TranscriptFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [segments, autoScroll]);

  if (segments.length === 0) {
    return (
      <div className="transcript-feed">
        <div className="transcript-empty">
          <span>No transcript data yet. Join a meeting to start recording.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="transcript-feed" ref={feedRef}>
      {segments.map((segment, i) => (
        <div key={i} className="transcript-segment">
          <div className="transcript-meta">
            <span className="transcript-timestamp">
              {formatTime(segment.timestamp)}
            </span>
            <span className="transcript-speaker">{segment.speaker}</span>
          </div>
          <div className="transcript-text">{segment.text}</div>
        </div>
      ))}
    </div>
  );
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
