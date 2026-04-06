import { useReducer, useEffect, useCallback, useState } from 'react';
import type {
  DashboardState,
  DashboardAction,
  Session,
  BotStatus,
  HeygenStatus,
  ExtractedComment,
} from './types';
import { Header } from './components/Header';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { useDashboardWS } from './hooks/useDashboardWS';
import * as api from './api/client';

// ── Initial State ──

const initialState: DashboardState = {
  wsConnected: false,
  session: null,
  paper: {
    fileName: null,
    text: null,
    summary: null,
    comments: [],
    isExtracting: false,
    isAnalyzing: false,
  },
  questions: [],
  selectedQuestionId: null,
  transcript: [],
  autoScroll: true,
  meeting: {
    zoomUrl: '',
    botName: 'Kira (AI Principal SA)',
    isJoining: false,
    isLeaving: false,
  },
  controls: {
    isRaisingHand: false,
    isLoweringHand: false,
    isSpeaking: false,
    customSpeakText: '',
  },
  status: {
    bot: 'disconnected',
    heygen: 'disconnected',
    transcript: 'idle',
  },
  settings: {
    ttsVoice: 'Rachel',
    personalityStyle: 'professional',
    maxQuestions: 5,
    systemPrompt: '',
  },
  modals: {
    settings: false,
    editQuestion: null,
  },
  errors: [],
};

// ── Reducer ──

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    // Connection
    case 'WS_CONNECTED':
      return { ...state, wsConnected: true };
    case 'WS_DISCONNECTED':
      return { ...state, wsConnected: false };

    // Session
    case 'SESSION_LOADED':
      return {
        ...state,
        session: action.session,
        questions: action.session.questions,
        transcript: action.session.transcript,
      };
    case 'SESSION_CLEARED':
      return {
        ...state,
        session: null,
        questions: [],
        transcript: [],
        status: { bot: 'disconnected', heygen: 'disconnected', transcript: 'idle' },
      };
    case 'STATE_CHANGED':
      return {
        ...state,
        session: state.session ? { ...state.session, state: action.state } : null,
      };

    // Paper
    case 'PAPER_TEXT_SET':
      return {
        ...state,
        paper: {
          ...state.paper,
          text: action.text,
          fileName: action.fileName ?? null,
          comments: action.comments ?? state.paper.comments,
        },
      };
    case 'PAPER_EXTRACT_START':
      return { ...state, paper: { ...state.paper, isExtracting: true } };
    case 'PAPER_EXTRACTED':
      return {
        ...state,
        paper: {
          ...state.paper,
          isExtracting: false,
          text: action.text,
          fileName: action.fileName,
          comments: action.comments,
        },
      };
    case 'PAPER_EXTRACT_ERROR':
      return {
        ...state,
        paper: { ...state.paper, isExtracting: false },
        errors: [...state.errors, {
          id: crypto.randomUUID(),
          message: action.error,
          timestamp: Date.now(),
          dismissed: false,
        }],
      };
    case 'PAPER_ANALYZE_START':
      return { ...state, paper: { ...state.paper, isAnalyzing: true } };
    case 'PAPER_ANALYZED':
      return {
        ...state,
        paper: { ...state.paper, isAnalyzing: false, summary: action.summary },
        questions: action.questions,
      };
    case 'PAPER_ANALYZE_ERROR':
      return {
        ...state,
        paper: { ...state.paper, isAnalyzing: false },
        errors: [...state.errors, {
          id: crypto.randomUUID(),
          message: action.error,
          timestamp: Date.now(),
          dismissed: false,
        }],
      };
    case 'PAPER_CLEARED':
      return {
        ...state,
        paper: { fileName: null, text: null, summary: null, comments: [], isExtracting: false, isAnalyzing: false },
        questions: [],
      };

    // Questions
    case 'QUESTIONS_SET':
      return { ...state, questions: action.questions };
    case 'QUESTION_UPDATED':
      return {
        ...state,
        questions: state.questions.map((q) =>
          q.id === action.id ? { ...q, ...action.updates } : q,
        ),
      };
    case 'QUESTION_DELETED':
      return {
        ...state,
        questions: state.questions.filter((q) => q.id !== action.id),
      };
    case 'QUESTION_ADDED':
      return { ...state, questions: [...state.questions, action.question] };
    case 'QUESTION_SELECTED':
      return { ...state, selectedQuestionId: action.id };

    // Transcript
    case 'TRANSCRIPT_SEGMENT':
      return {
        ...state,
        transcript: [...state.transcript, action.segment],
        status: { ...state.status, transcript: 'streaming' },
      };
    case 'TRANSCRIPT_CLEARED':
      return { ...state, transcript: [] };
    case 'AUTO_SCROLL_TOGGLED':
      return { ...state, autoScroll: !state.autoScroll };

    // Meeting
    case 'ZOOM_URL_CHANGED':
      return { ...state, meeting: { ...state.meeting, zoomUrl: action.url } };
    case 'BOT_NAME_CHANGED':
      return { ...state, meeting: { ...state.meeting, botName: action.name } };
    case 'JOIN_START':
      return { ...state, meeting: { ...state.meeting, isJoining: true } };
    case 'JOIN_SUCCESS':
      return {
        ...state,
        session: action.session,
        questions: action.session.questions,
        meeting: { ...state.meeting, isJoining: false },
        status: { ...state.status, bot: 'joining' },
      };
    case 'JOIN_ERROR':
      return {
        ...state,
        meeting: { ...state.meeting, isJoining: false },
        errors: [...state.errors, {
          id: crypto.randomUUID(),
          message: action.error,
          timestamp: Date.now(),
          dismissed: false,
        }],
      };
    case 'LEAVE_START':
      return { ...state, meeting: { ...state.meeting, isLeaving: true } };
    case 'LEAVE_SUCCESS':
      return {
        ...state,
        meeting: { ...state.meeting, isLeaving: false },
        session: state.session ? { ...state.session, state: 'DONE' } : null,
        status: { ...state.status, bot: 'left' },
      };
    case 'LEAVE_ERROR':
      return {
        ...state,
        meeting: { ...state.meeting, isLeaving: false },
        errors: [...state.errors, {
          id: crypto.randomUUID(),
          message: action.error,
          timestamp: Date.now(),
          dismissed: false,
        }],
      };

    // In-call
    case 'RAISE_HAND_START':
      return { ...state, controls: { ...state.controls, isRaisingHand: true } };
    case 'RAISE_HAND_SUCCESS':
      return { ...state, controls: { ...state.controls, isRaisingHand: false } };
    case 'RAISE_HAND_ERROR':
      return {
        ...state,
        controls: { ...state.controls, isRaisingHand: false },
        errors: [...state.errors, {
          id: crypto.randomUUID(),
          message: action.error,
          timestamp: Date.now(),
          dismissed: false,
        }],
      };
    case 'LOWER_HAND_START':
      return { ...state, controls: { ...state.controls, isLoweringHand: true } };
    case 'LOWER_HAND_SUCCESS':
      return { ...state, controls: { ...state.controls, isLoweringHand: false } };
    case 'LOWER_HAND_ERROR':
      return {
        ...state,
        controls: { ...state.controls, isLoweringHand: false },
        errors: [...state.errors, {
          id: crypto.randomUUID(),
          message: action.error,
          timestamp: Date.now(),
          dismissed: false,
        }],
      };
    case 'SPEAK_START':
      return { ...state, controls: { ...state.controls, isSpeaking: true } };
    case 'SPEAK_SUCCESS':
      return { ...state, controls: { ...state.controls, isSpeaking: false, customSpeakText: '' } };
    case 'SPEAK_ERROR':
      return {
        ...state,
        controls: { ...state.controls, isSpeaking: false },
        errors: [...state.errors, {
          id: crypto.randomUUID(),
          message: action.error,
          timestamp: Date.now(),
          dismissed: false,
        }],
      };
    case 'CUSTOM_TEXT_CHANGED':
      return { ...state, controls: { ...state.controls, customSpeakText: action.text } };

    // Status
    case 'BOT_STATUS_CHANGED': {
      const statusMap: Record<string, BotStatus> = {
        ready: 'disconnected',
        joining_call: 'joining',
        in_waiting_room: 'waiting_room',
        in_call_not_recording: 'in_call',
        in_call_recording: 'recording',
        call_ended: 'left',
        done: 'left',
      };
      return {
        ...state,
        status: { ...state.status, bot: statusMap[action.status] ?? 'disconnected' },
      };
    }
    case 'HEYGEN_STATUS_CHANGED':
      return {
        ...state,
        status: { ...state.status, heygen: action.status as HeygenStatus },
      };

    // Settings
    case 'SETTINGS_CHANGED':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    // Modals
    case 'MODAL_OPENED':
      if (action.modal === 'editQuestion') {
        return { ...state, modals: { ...state.modals, editQuestion: action.data ?? null } };
      }
      return { ...state, modals: { ...state.modals, [action.modal]: true } };
    case 'MODAL_CLOSED':
      if (action.modal === 'editQuestion') {
        return { ...state, modals: { ...state.modals, editQuestion: null } };
      }
      return { ...state, modals: { ...state.modals, [action.modal]: false } };

    // Errors
    case 'ERROR_ADDED':
      return {
        ...state,
        errors: [...state.errors, {
          id: crypto.randomUUID(),
          message: action.message,
          timestamp: Date.now(),
          dismissed: false,
        }],
      };
    case 'ERROR_DISMISSED':
      return {
        ...state,
        errors: state.errors.map((e) =>
          e.id === action.id ? { ...e, dismissed: true } : e,
        ),
      };

    default:
      return state;
  }
}

// ── App Component ──

export default function App() {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);

  // Connect WebSocket when we have a session
  useDashboardWS(state.session?.id ?? null, dispatch);

  // Check for existing active session on mount
  useEffect(() => {
    api.listSessions().then((sessions) => {
      const active = sessions.find((s) => s.state !== 'DONE');
      if (active) {
        dispatch({ type: 'SESSION_LOADED', session: active });
      }
    }).catch((err) => {
      console.error('Failed to fetch sessions:', err);
    });

    // Load defaults from server config, then append HeyGen context
    let serverPrompt = '';
    
    api.getConfigDefaults().then((defaults: { defaultBotName: string; defaultTtsVoice: string; defaultSystemPrompt: string; personality?: { style?: string } }) => {
      serverPrompt = defaults.defaultSystemPrompt || '';
      dispatch({
        type: 'SETTINGS_CHANGED',
        settings: {
          systemPrompt: serverPrompt,
          ttsVoice: defaults.defaultTtsVoice,
          personalityStyle: (defaults.personality?.style as 'academic' | 'casual' | 'provocative' | 'professional') || 'professional',
        },
      });
      dispatch({ type: 'BOT_NAME_CHANGED', name: defaults.defaultBotName });

      // Then load HeyGen context and append
      return api.getHeygenContext();
    }).then((ctx: { prompt?: string }) => {
      if (ctx.prompt && ctx.prompt !== serverPrompt) {
        const combined = serverPrompt
          ? serverPrompt + '\n\n--- Current HeyGen Context ---\n' + ctx.prompt
          : ctx.prompt;
        dispatch({ type: 'SETTINGS_CHANGED', settings: { systemPrompt: combined } });
      }
    }).catch(() => {
      console.error('Failed to load config/context');
    });
  }, []);

  // ── Action handlers ──

  const handleJoin = useCallback(async () => {
    if (!state.meeting.zoomUrl.trim()) return;
    dispatch({ type: 'JOIN_START' });
    try {
      const session = await api.createSession({
        meetingUrl: state.meeting.zoomUrl,
        botName: state.meeting.botName,
        paperText: state.paper.text ?? undefined,
        paperSummary: state.paper.summary ?? undefined,
        questions: state.questions.length > 0 ? state.questions : undefined,
        comments: state.paper.comments.length > 0
          ? state.paper.comments.map((c) => ({
              author: c.author,
              comment: c.comment,
              anchored_text: c.anchored_text,
            }))
          : undefined,
        config: {
          ttsVoice: state.settings.ttsVoice,
          maxQuestions: state.settings.maxQuestions,
          personality: { style: state.settings.personalityStyle },
          systemPrompt: state.settings.systemPrompt || undefined,
        },
      });
      dispatch({ type: 'JOIN_SUCCESS', session });
    } catch (err) {
      dispatch({ type: 'JOIN_ERROR', error: (err as Error).message });
    }
  }, [state.meeting, state.paper, state.questions, state.settings]);

  const handleLeave = useCallback(async () => {
    if (!state.session) return;
    dispatch({ type: 'LEAVE_START' });
    try {
      await api.leaveSession(state.session.id);
      dispatch({ type: 'LEAVE_SUCCESS' });
    } catch (err) {
      dispatch({ type: 'LEAVE_ERROR', error: (err as Error).message });
    }
  }, [state.session]);

  const handleRaiseHand = useCallback(async () => {
    if (!state.session) return;
    dispatch({ type: 'RAISE_HAND_START' });
    try {
      await api.raiseHand(state.session.id);
      dispatch({ type: 'RAISE_HAND_SUCCESS' });
    } catch (err) {
      dispatch({ type: 'RAISE_HAND_ERROR', error: (err as Error).message });
    }
  }, [state.session]);

  const handleLowerHand = useCallback(async () => {
    if (!state.session) return;
    dispatch({ type: 'LOWER_HAND_START' });
    try {
      await api.lowerHand(state.session.id);
      dispatch({ type: 'LOWER_HAND_SUCCESS' });
    } catch (err) {
      dispatch({ type: 'LOWER_HAND_ERROR', error: (err as Error).message });
    }
  }, [state.session]);

  const handleSpeak = useCallback(async () => {
    if (!state.session) return;
    dispatch({ type: 'SPEAK_START' });
    try {
      const payload: { questionId?: string; text?: string } = {};
      if (state.controls.customSpeakText.trim()) {
        payload.text = state.controls.customSpeakText;
      } else if (state.selectedQuestionId) {
        payload.questionId = state.selectedQuestionId;
      } else {
        // Pick first ready question
        const ready = state.questions.find((q) => q.status === 'ready');
        if (ready) payload.questionId = ready.id;
      }

      if (!payload.text && !payload.questionId) {
        dispatch({ type: 'SPEAK_ERROR', error: 'No text or question selected' });
        return;
      }

      // Resolve the text to speak
      let textToSpeak = payload.text ?? '';
      if (!textToSpeak && payload.questionId) {
        const q = state.questions.find((q) => q.id === payload.questionId);
        textToSpeak = q?.text ?? '';
      }

      if (!textToSpeak) {
        dispatch({ type: 'SPEAK_ERROR', error: 'Could not resolve text to speak' });
        return;
      }

      // Send ONLY to HeyGen avatar (not ElevenLabs/output_audio which produces a different voice)
      try {
        await api.avatarSpeak(textToSpeak);
      } catch {
        // Fallback: try the session speak endpoint (uses ElevenLabs)
        await api.speak(state.session.id, payload);
      }

      dispatch({ type: 'SPEAK_SUCCESS', text: textToSpeak });

      // Mark question as asked locally
      if (payload.questionId) {
        dispatch({ type: 'QUESTION_UPDATED', id: payload.questionId, updates: { status: 'asked' } });
      }
    } catch (err) {
      dispatch({ type: 'SPEAK_ERROR', error: (err as Error).message });
    }
  }, [state.session, state.controls.customSpeakText, state.selectedQuestionId, state.questions]);

  const handleAnalyze = useCallback(async () => {
    if (!state.paper.text) return;
    dispatch({ type: 'PAPER_ANALYZE_START' });
    try {
      const result = await api.analyzePaper({
        text: state.paper.text,
        maxQuestions: state.settings.maxQuestions,
        personality: { style: state.settings.personalityStyle },
        systemPrompt: state.settings.systemPrompt || undefined,
      });
      dispatch({ type: 'PAPER_ANALYZED', summary: result.summary, questions: result.questions });
    } catch (err) {
      dispatch({ type: 'PAPER_ANALYZE_ERROR', error: (err as Error).message });
    }
  }, [state.paper.text, state.settings]);

  const handleDownloadTranscript = useCallback(async () => {
    if (!state.session) return;
    try {
      await api.downloadTranscript(state.session.id);
    } catch (err) {
      dispatch({ type: 'ERROR_ADDED', message: (err as Error).message });
    }
  }, [state.session]);

  // Auto-dismiss errors after 8 seconds
  useEffect(() => {
    const active = state.errors.filter((e) => !e.dismissed);
    if (active.length === 0) return;
    const timer = setTimeout(() => {
      active.forEach((e) => dispatch({ type: 'ERROR_DISMISSED', id: e.id }));
    }, 8000);
    return () => clearTimeout(timer);
  }, [state.errors]);

  return (
    <div className="app-layout">
      <Header
        wsConnected={state.wsConnected}
        sessionState={state.session?.state ?? null}
        onSettingsClick={() => dispatch({ type: 'MODAL_OPENED', modal: 'settings' })}
      />

      <div className="main-layout">
        <LeftPanel
          paper={state.paper}
          questions={state.questions}
          selectedQuestionId={state.selectedQuestionId}
          settings={state.settings}
          isAnalyzing={state.paper.isAnalyzing}
          dispatch={dispatch}
          onAnalyze={handleAnalyze}
        />

        <RightPanel
          transcript={state.transcript}
          autoScroll={state.autoScroll}
          status={state.status}
          session={state.session}
          meeting={state.meeting}
          controls={state.controls}
          questions={state.questions}
          selectedQuestionId={state.selectedQuestionId}
          dispatch={dispatch}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onRaiseHand={handleRaiseHand}
          onLowerHand={handleLowerHand}
          onSpeak={handleSpeak}
          onDownloadTranscript={handleDownloadTranscript}
        />
      </div>

      {/* Error Toasts */}
      {state.errors.filter((e) => !e.dismissed).length > 0 && (
        <div className="toast-container">
          {state.errors
            .filter((e) => !e.dismissed)
            .map((error) => (
              <div key={error.id} className="toast">
                <span>{error.message}</span>
                <button
                  className="toast-dismiss"
                  onClick={() => dispatch({ type: 'ERROR_DISMISSED', id: error.id })}
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Settings Modal */}
      {state.modals.settings && (
        <SettingsModal
          settings={state.settings}
          dispatch={dispatch}
        />
      )}

      {/* Edit Question Modal */}
      {state.modals.editQuestion && (
        <EditQuestionModal
          questionId={state.modals.editQuestion}
          questions={state.questions}
          dispatch={dispatch}
        />
      )}
    </div>
  );
}

// ── Settings Modal ──

function SettingsModal({
  settings,
  dispatch,
}: {
  settings: DashboardState['settings'];
  dispatch: React.Dispatch<DashboardAction>;
}) {
  return (
    <div className="modal-overlay" onClick={() => dispatch({ type: 'MODAL_CLOSED', modal: 'settings' })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">⚙️ Settings</h2>
          <button
            className="modal-close"
            onClick={() => dispatch({ type: 'MODAL_CLOSED', modal: 'settings' })}
          >
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">TTS Voice</label>
            <select
              className="select"
              value={settings.ttsVoice}
              onChange={(e) => dispatch({ type: 'SETTINGS_CHANGED', settings: { ttsVoice: e.target.value } })}
            >
              {['Rachel', 'Domi', 'Bella', 'Antoni', 'Elli', 'Josh', 'Arnold', 'Adam', 'Sam'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Personality Style</label>
            <select
              className="select"
              value={settings.personalityStyle}
              onChange={(e) =>
                dispatch({
                  type: 'SETTINGS_CHANGED',
                  settings: { personalityStyle: e.target.value as DashboardState['settings']['personalityStyle'] },
                })
              }
            >
              {['professional', 'academic', 'casual', 'provocative'].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Max Questions</label>
            <input
              className="input"
              type="number"
              min={1}
              max={10}
              value={settings.maxQuestions}
              onChange={(e) => dispatch({ type: 'SETTINGS_CHANGED', settings: { maxQuestions: parseInt(e.target.value) || 5 } })}
            />
          </div>
          <div className="field">
            <label className="field-label">System Prompt Override</label>
            <textarea
              className="textarea"
              rows={4}
              value={settings.systemPrompt}
              onChange={(e) => dispatch({ type: 'SETTINGS_CHANGED', settings: { systemPrompt: e.target.value } })}
              placeholder="Leave empty to use server default"
            />
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-primary"
            onClick={() => dispatch({ type: 'MODAL_CLOSED', modal: 'settings' })}
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Question Modal ──

function EditQuestionModal({
  questionId,
  questions,
  dispatch,
}: {
  questionId: string;
  questions: DashboardState['questions'];
  dispatch: React.Dispatch<DashboardAction>;
}) {
  const question = questions.find((q) => q.id === questionId);
  const [text, setText] = useState(question?.text ?? '');
  const [rationale, setRationale] = useState(question?.rationale ?? '');

  if (!question) return null;

  const handleSave = () => {
    dispatch({
      type: 'QUESTION_UPDATED',
      id: questionId,
      updates: { text, rationale },
    });
    dispatch({ type: 'MODAL_CLOSED', modal: 'editQuestion' });
  };

  return (
    <div className="modal-overlay" onClick={() => dispatch({ type: 'MODAL_CLOSED', modal: 'editQuestion' })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">✏️ Edit Question</h2>
          <button
            className="modal-close"
            onClick={() => dispatch({ type: 'MODAL_CLOSED', modal: 'editQuestion' })}
          >
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">Question</label>
            <textarea
              className="field-textarea"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your question here..."
              autoFocus
            />
          </div>
          <div className="field">
            <label className="field-label">Rationale (optional)</label>
            <textarea
              className="field-textarea"
              rows={2}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why is this question important?"
            />
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => dispatch({ type: 'MODAL_CLOSED', modal: 'editQuestion' })}
          >
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
