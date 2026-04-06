import { useState } from 'react';
import type { DashboardState, DashboardAction, Question } from '../types';
import { PaperUpload } from './PaperUpload';
import { QuestionList } from './QuestionList';
import { ContextEditor } from './ContextEditor';

interface LeftPanelProps {
  paper: DashboardState['paper'];
  questions: Question[];
  selectedQuestionId: string | null;
  settings: DashboardState['settings'];
  isAnalyzing: boolean;
  dispatch: React.Dispatch<DashboardAction>;
  onAnalyze: () => void;
}

export function LeftPanel({
  paper,
  questions,
  selectedQuestionId,
  settings,
  isAnalyzing,
  dispatch,
  onAnalyze,
}: LeftPanelProps) {
  const [showComments, setShowComments] = useState(false);

  return (
    <div className="left-panel">
      {/* Paper Section */}
      <div className="panel">
        <div className="section-header">
          <h2 className="section-title">
            <span className="section-icon">📄</span>
            Paper
          </h2>
        </div>
        <PaperUpload
          paper={paper}
          dispatch={dispatch}
        />
        {paper.text && (
          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={onAnalyze}
              disabled={isAnalyzing || !paper.text}
              style={{ width: '100%' }}
            >
              {isAnalyzing ? (
                <>
                  <span className="spinner spinner-sm" />
                  Analyzing paper...
                </>
              ) : (
                '🧠 Generate Questions'
              )}
            </button>
          </div>
        )}
        {paper.summary && (
          <div className="paper-preview" style={{ marginTop: 8 }}>
            {paper.fileName && (
              <div className="paper-file-info">
                <span className="paper-file-name">{paper.fileName}</span>
                <span className="paper-file-check">✓</span>
              </div>
            )}
            <p className="paper-summary">{paper.summary}</p>
          </div>
        )}

        {/* Comments Section */}
        {paper.comments.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowComments(!showComments)}
              style={{ width: '100%' }}
            >
              {showComments ? '▾ Hide' : '▸ Show'} {paper.comments.length} Document Comment{paper.comments.length !== 1 ? 's' : ''}
            </button>
            {showComments && (
              <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                {paper.comments.map((c, i) => (
                  <div
                    key={c.id ?? i}
                    style={{
                      padding: '6px 8px',
                      marginBottom: 4,
                      borderRadius: 4,
                      background: 'var(--bg-secondary)',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {c.author}
                      {c.date && (
                        <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                          {c.date}
                        </span>
                      )}
                    </div>
                    {c.anchored_text && (
                      <div style={{
                        color: 'var(--text-tertiary)',
                        fontStyle: 'italic',
                        fontSize: 11,
                        marginTop: 2,
                        borderLeft: '2px solid var(--border-muted)',
                        paddingLeft: 6,
                      }}>
                        "{c.anchored_text.slice(0, 100)}{c.anchored_text.length > 100 ? '…' : ''}"
                      </div>
                    )}
                    <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                      {c.comment}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Questions Section */}
      <div className="panel">
        <div className="section-header">
          <h2 className="section-title">
            <span className="section-icon">🧠</span>
            Questions
          </h2>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {questions.filter((q) => q.status === 'asked').length}/{questions.length} asked
          </span>
        </div>
        <QuestionList
          questions={questions}
          selectedQuestionId={selectedQuestionId}
          dispatch={dispatch}
        />
      </div>

      {/* Context Section */}
      <div className="panel">
        <div className="section-header">
          <h2 className="section-title">
            <span className="section-icon">💬</span>
            Context
          </h2>
        </div>
        <ContextEditor
          systemPrompt={settings.systemPrompt}
          dispatch={dispatch}
        />
      </div>
    </div>
  );
}
