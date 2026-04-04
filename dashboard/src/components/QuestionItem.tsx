import { useState } from 'react';
import type { Question, DashboardAction } from '../types';

interface QuestionItemProps {
  question: Question;
  index: number;
  isSelected: boolean;
  dispatch: React.Dispatch<DashboardAction>;
}

export function QuestionItem({ question, index, isSelected, dispatch }: QuestionItemProps) {
  const [showRationale, setShowRationale] = useState(false);

  return (
    <div
      className={`question-item ${isSelected ? 'selected' : ''}`}
      onClick={() => dispatch({ type: 'QUESTION_SELECTED', id: isSelected ? null : question.id })}
    >
      <div className="question-item-header">
        <span className="question-number">{index + 1}.</span>
        <span className="question-text">{question.text || <em style={{ color: 'var(--text-tertiary)' }}>Empty question — click edit</em>}</span>
        <div className="question-actions">
          <span className={`badge badge-${question.status}`}>
            {question.status}
          </span>
        </div>
      </div>

      {question.rationale && (
        <div style={{ marginLeft: 28 }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '2px 6px', fontSize: 11 }}
            onClick={(e) => {
              e.stopPropagation();
              setShowRationale(!showRationale);
            }}
          >
            {showRationale ? 'Hide rationale' : 'Rationale ▾'}
          </button>
          {showRationale && (
            <div className="question-rationale">{question.rationale}</div>
          )}
        </div>
      )}

      <div style={{ marginLeft: 28, display: 'flex', gap: 4, marginTop: 4 }}>
        <button
          className="btn btn-secondary btn-sm"
          style={{ padding: '2px 8px', fontSize: 11 }}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'MODAL_OPENED', modal: 'editQuestion', data: question.id });
          }}
        >
          Edit
        </button>
        <button
          className="btn btn-secondary btn-sm"
          style={{ padding: '2px 8px', fontSize: 11, color: 'var(--accent-red)' }}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'QUESTION_DELETED', id: question.id });
          }}
        >
          Delete
        </button>
        {question.status === 'ready' && (
          <button
            className="btn btn-primary btn-sm"
            style={{ padding: '2px 8px', fontSize: 11, marginLeft: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'QUESTION_SELECTED', id: question.id });
            }}
          >
            🎤 Speak this
          </button>
        )}
      </div>
    </div>
  );
}
