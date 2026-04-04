import type { Question, DashboardAction } from '../types';

interface SpeakDialogProps {
  questions: Question[];
  selectedQuestionId: string | null;
  customText: string;
  isSpeaking: boolean;
  dispatch: React.Dispatch<DashboardAction>;
  onSpeak: () => void;
}

export function SpeakDialog({
  questions,
  selectedQuestionId,
  customText,
  isSpeaking,
  dispatch,
  onSpeak,
}: SpeakDialogProps) {
  const readyQuestions = questions.filter((q) => q.status === 'ready');

  return (
    <div className="speak-group">
      <div className="field">
        <label className="field-label">🎤 Speak</label>
        <select
          className="select"
          value={selectedQuestionId ?? ''}
          onChange={(e) =>
            dispatch({ type: 'QUESTION_SELECTED', id: e.target.value || null })
          }
        >
          <option value="">Select a question...</option>
          {readyQuestions.map((q, i) => (
            <option key={q.id} value={q.id}>
              {i + 1}. {q.text.slice(0, 80)}{q.text.length > 80 ? '...' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <input
          className="input"
          type="text"
          placeholder="Or type custom text..."
          value={customText}
          onChange={(e) => dispatch({ type: 'CUSTOM_TEXT_CHANGED', text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (customText.trim() || selectedQuestionId)) {
              onSpeak();
            }
          }}
        />
      </div>

      <button
        className="btn btn-success"
        onClick={onSpeak}
        disabled={isSpeaking || (!customText.trim() && !selectedQuestionId && readyQuestions.length === 0)}
        style={{ width: '100%' }}
      >
        {isSpeaking ? (
          <>
            <span className="spinner spinner-sm" />
            Speaking...
          </>
        ) : (
          '🔊 Speak Now'
        )}
      </button>
    </div>
  );
}
