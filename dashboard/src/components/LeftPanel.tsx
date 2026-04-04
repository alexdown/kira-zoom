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
