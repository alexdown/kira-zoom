import type { SessionState } from '../types';

interface HeaderProps {
  wsConnected: boolean;
  sessionState: SessionState | null;
  onSettingsClick: () => void;
}

export function Header({ wsConnected, sessionState, onSettingsClick }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <div className="header-logo-dot" />
          <h1 className="header-title">
            KIRA
            <span>AI Meeting Bot Control</span>
          </h1>
        </div>
        {sessionState && (
          <span className={`badge badge-${getStateBadgeClass(sessionState)}`}>
            {sessionState}
          </span>
        )}
      </div>
      <div className="header-right">
        <div className={`connection-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
        <span className="ws-label">{wsConnected ? 'Connected' : 'Disconnected'}</span>
        <button className="btn-icon" onClick={onSettingsClick} title="Settings">
          ⚙
        </button>
      </div>
    </header>
  );
}

function getStateBadgeClass(state: SessionState): string {
  switch (state) {
    case 'LISTENING': return 'ready';
    case 'HAND_RAISED': return 'raised';
    case 'SPEAKING': return 'raised';
    case 'DONE': return 'asked';
    default: return 'skipped';
  }
}
