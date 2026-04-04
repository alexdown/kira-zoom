import type { Session, DashboardState, DashboardAction } from '../types';

interface MeetingControlsProps {
  meeting: DashboardState['meeting'];
  session: Session | null;
  controls: DashboardState['controls'];
  dispatch: React.Dispatch<DashboardAction>;
  onJoin: () => void;
  onLeave: () => void;
}

export function MeetingControls({
  meeting,
  session,
  dispatch,
  onJoin,
  onLeave,
}: MeetingControlsProps) {
  const hasSession = !!session;
  const isActive = session && session.state !== 'DONE' && session.state !== 'IDLE';

  return (
    <div className="meeting-controls">
      <div className="meeting-url-group">
        <div className="field">
          <label className="field-label">Zoom URL</label>
          <input
            className="input"
            type="url"
            placeholder="https://zoom.us/j/123456789?pwd=..."
            value={meeting.zoomUrl}
            onChange={(e) => dispatch({ type: 'ZOOM_URL_CHANGED', url: e.target.value })}
            disabled={isActive ?? false}
          />
        </div>
        <div className="field">
          <label className="field-label">Bot Name</label>
          <input
            className="input"
            type="text"
            placeholder="Kira (AI Principal SA)"
            value={meeting.botName}
            onChange={(e) => dispatch({ type: 'BOT_NAME_CHANGED', name: e.target.value })}
            disabled={isActive ?? false}
          />
        </div>
      </div>

      <div className="button-row">
        <button
          className="btn btn-primary"
          onClick={onJoin}
          disabled={meeting.isJoining || !meeting.zoomUrl.trim() || (isActive ?? false)}
          style={{ flex: 1 }}
        >
          {meeting.isJoining ? (
            <>
              <span className="spinner spinner-sm" />
              Creating bot...
            </>
          ) : (
            '🚀 Join Meeting'
          )}
        </button>
        <button
          className="btn btn-danger"
          onClick={onLeave}
          disabled={meeting.isLeaving || !hasSession || !isActive}
          style={{ flex: 1 }}
        >
          {meeting.isLeaving ? (
            <>
              <span className="spinner spinner-sm" />
              Leaving...
            </>
          ) : (
            '🚪 Leave Meeting'
          )}
        </button>
      </div>
    </div>
  );
}
