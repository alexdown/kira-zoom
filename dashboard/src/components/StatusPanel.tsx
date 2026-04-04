import type { DashboardState, Session, BotStatus } from '../types';
import { useMeetingTimer } from '../hooks/useApi';

interface StatusPanelProps {
  status: DashboardState['status'];
  session: Session | null;
}

export function StatusPanel({ status, session }: StatusPanelProps) {
  const joinedAt = session?.createdAt ? new Date(session.createdAt).getTime() : null;
  const isActive = session && session.state !== 'IDLE' && session.state !== 'DONE';
  const duration = useMeetingTimer(isActive ? joinedAt : null);

  const questionsAsked = session?.questions.filter((q) => q.status === 'asked').length ?? 0;
  const questionsTotal = session?.questions.length ?? 0;

  return (
    <div className="status-panel">
      <div className="status-row">
        <span className="status-label">Bot</span>
        <span className={`status-dot ${getBotDotColor(status.bot)}`} />
        <span className="status-value">{getBotLabel(status.bot)}</span>
      </div>
      <div className="status-row">
        <span className="status-label">HeyGen</span>
        <span className={`status-dot ${getHeygenDotColor(status.heygen)}`} />
        <span className="status-value">{capitalizeFirst(status.heygen)}</span>
      </div>
      <div className="status-row">
        <span className="status-label">Transcript</span>
        <span className={`status-dot ${status.transcript === 'streaming' ? 'green' : status.transcript === 'error' ? 'red' : 'grey'}`} />
        <span className="status-value">{capitalizeFirst(status.transcript)}</span>
      </div>
      {session && (
        <div className="status-row">
          <span className="status-label">Session</span>
          <span className={`status-dot ${getSessionDotColor(session.state)}`} />
          <span className="status-value">{session.state}</span>
        </div>
      )}

      <div className="metrics-row">
        <div className="metric">
          <span className="metric-label">Duration</span>
          <span className="metric-value">{duration}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Segments</span>
          <span className="metric-value">{session?.transcript.length ?? 0}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Questions</span>
          <span className="metric-value">{questionsAsked}/{questionsTotal}</span>
        </div>
      </div>
    </div>
  );
}

function getBotDotColor(status: BotStatus): string {
  switch (status) {
    case 'recording': return 'green';
    case 'in_call': return 'green';
    case 'joining': return 'yellow';
    case 'waiting_room': return 'yellow';
    case 'left': return 'grey';
    case 'disconnected': return 'grey';
    default: return 'grey';
  }
}

function getBotLabel(status: BotStatus): string {
  switch (status) {
    case 'recording': return 'In Call (recording)';
    case 'in_call': return 'In Call';
    case 'joining': return 'Joining...';
    case 'waiting_room': return 'In Waiting Room';
    case 'left': return 'Left';
    case 'disconnected': return 'Not connected';
    default: return status;
  }
}

function getHeygenDotColor(status: string): string {
  switch (status) {
    case 'connected': return 'green';
    case 'connecting': return 'yellow';
    case 'error': return 'red';
    case 'disconnected': return 'grey';
    default: return 'grey';
  }
}

function getSessionDotColor(state: string): string {
  switch (state) {
    case 'LISTENING': return 'green';
    case 'HAND_RAISED': return 'yellow';
    case 'SPEAKING': return 'orange';
    case 'JOINING': return 'blue';
    case 'DONE': return 'grey';
    default: return 'grey';
  }
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
