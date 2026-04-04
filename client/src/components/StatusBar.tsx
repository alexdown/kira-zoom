interface StatusBarProps {
  botName: string;
  statusText: string;
  connected: boolean;
}

export default function StatusBar({ botName, statusText, connected }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className={`connection-dot ${connected ? "connected" : "disconnected"}`} />
        <span className="status-bot-name">{botName}</span>
      </div>
      <div className="status-bar-right">
        <span className="status-text">{statusText}</span>
      </div>
    </div>
  );
}
