import type {
  TranscriptSegment,
  Session,
  DashboardState,
  DashboardAction,
  Question,
  ContextInjection,
} from '../types';
import { TranscriptFeed } from './TranscriptFeed';
import { StatusPanel } from './StatusPanel';
import { MeetingControls } from './MeetingControls';
import { SpeakDialog } from './SpeakDialog';
import { ContextInjector } from './ContextInjector';

interface RightPanelProps {
  transcript: TranscriptSegment[];
  autoScroll: boolean;
  status: DashboardState['status'];
  session: Session | null;
  meeting: DashboardState['meeting'];
  controls: DashboardState['controls'];
  questions: Question[];
  selectedQuestionId: string | null;
  paper: DashboardState['paper'];
  contextInjections: ContextInjection[];
  dispatch: React.Dispatch<DashboardAction>;
  onJoin: () => void;
  onLeave: () => void;
  onRaiseHand: () => void;
  onLowerHand: () => void;
  onSpeak: () => void;
  onDownloadTranscript: () => void;
}

export function RightPanel({
  transcript,
  autoScroll,
  status,
  session,
  meeting,
  controls,
  questions,
  selectedQuestionId,
  paper,
  contextInjections,
  dispatch,
  onJoin,
  onLeave,
  onRaiseHand,
  onLowerHand,
  onSpeak,
  onDownloadTranscript,
}: RightPanelProps) {
  const sessionState = session?.state ?? null;
  const isInCall = sessionState === 'JOINING' || sessionState === 'LISTENING' || sessionState === 'HAND_RAISED' || sessionState === 'SPEAKING';
  const isDone = sessionState === 'DONE';

  return (
    <div className="right-panel">
      {/* Transcript */}
      <div className="panel transcript-panel transcript-section">
        <div className="transcript-header">
          <h2 className="section-title">
            <span className="section-icon">📡</span>
            Live Transcript
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {transcript.length} segments
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={() => dispatch({ type: 'AUTO_SCROLL_TOGGLED' })}
                style={{ accentColor: 'var(--accent-blue)' }}
              />
              Auto-scroll
            </label>
          </div>
        </div>
        <TranscriptFeed
          segments={transcript}
          autoScroll={autoScroll}
        />
      </div>

      {/* Status */}
      <div className="panel">
        <div className="section-header">
          <h2 className="section-title">
            <span className="section-icon">📊</span>
            Status
          </h2>
        </div>
        <StatusPanel
          status={status}
          session={session}
        />
      </div>

      {/* Meeting Controls */}
      <div className="panel">
        <div className="section-header">
          <h2 className="section-title">
            <span className="section-icon">🎛️</span>
            Meeting Control
          </h2>
        </div>
        <MeetingControls
          meeting={meeting}
          session={session}
          controls={controls}
          dispatch={dispatch}
          onJoin={onJoin}
          onLeave={onLeave}
        />

        {/* In-call actions */}
        {isInCall && (
          <div className="incall-section" style={{ marginTop: 12 }}>
            <div className="incall-label">In-Call Actions</div>
            <div className="button-row">
              <button
                className="btn btn-warning"
                onClick={onRaiseHand}
                disabled={controls.isRaisingHand || sessionState === 'HAND_RAISED' || sessionState === 'SPEAKING'}
              >
                {controls.isRaisingHand ? <span className="spinner spinner-sm" /> : '✋'}
                Raise Hand
              </button>
              <button
                className="btn btn-secondary"
                onClick={onLowerHand}
                disabled={controls.isLoweringHand || sessionState !== 'HAND_RAISED'}
              >
                {controls.isLoweringHand ? <span className="spinner spinner-sm" /> : '🤚'}
                Lower Hand
              </button>
            </div>

            <SpeakDialog
              questions={questions}
              selectedQuestionId={selectedQuestionId}
              customText={controls.customSpeakText}
              isSpeaking={controls.isSpeaking}
              dispatch={dispatch}
              onSpeak={onSpeak}
            />
          </div>
        )}

        {/* Send Context — visible during a call */}
        {isInCall && session && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border-muted)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              🧠 Send Context
            </div>
            <ContextInjector
              sessionId={session.id}
              injectText={controls.injectText}
              isInjecting={controls.isInjecting}
              paper={paper}
              contextInjections={contextInjections}
              dispatch={dispatch}
            />
          </div>
        )}

        {/* Post-meeting */}
        {isDone && transcript.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border-muted)', paddingTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={onDownloadTranscript}
              style={{ width: '100%' }}
            >
              📥 Download Transcript
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
