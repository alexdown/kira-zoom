import { useCallback } from 'react';
import type { DashboardAction, DashboardState, ContextInjection } from '../types';
import * as api from '../api/client';

interface ContextInjectorProps {
  sessionId: string;
  injectText: string;
  isInjecting: boolean;
  paper: DashboardState['paper'];
  questions: DashboardState['questions'];
  contextInjections: ContextInjection[];
  dispatch: React.Dispatch<DashboardAction>;
}

export function ContextInjector({
  sessionId,
  injectText,
  isInjecting,
  paper,
  questions,
  contextInjections,
  dispatch,
}: ContextInjectorProps) {

  const doInject = useCallback(async (text: string, label: string) => {
    if (!text.trim()) return;
    dispatch({ type: 'INJECT_CONTEXT_START' });
    try {
      const result = await api.injectContext(sessionId, text, label);
      const injection: ContextInjection = {
        id: crypto.randomUUID(),
        label,
        text,
        timestamp: Date.now(),
        preview: result.text,
      };
      dispatch({ type: 'INJECT_CONTEXT_SUCCESS', injection });
    } catch (err) {
      dispatch({ type: 'INJECT_CONTEXT_ERROR', error: (err as Error).message });
    }
  }, [sessionId, dispatch]);

  const handleSendCustom = useCallback(() => {
    doInject(injectText, 'Custom');
  }, [injectText, doInject]);

  const handleSendPaperSummary = useCallback(() => {
    const parts: string[] = [];
    if (paper.summary) {
      parts.push(`PAPER SUMMARY:\n${paper.summary}`);
    }
    if (paper.text) {
      if (!paper.summary) {
        parts.push(`PAPER TEXT (excerpt):\n${paper.text.slice(0, 3000)}${paper.text.length > 3000 ? '…' : ''}`);
      }
    }
    const readyQuestions = questions.filter((q) => q.status === 'ready');
    if (readyQuestions.length > 0) {
      parts.push(`YOUR PREPARED QUESTIONS (ask when appropriate):\n${readyQuestions.map((q, i) => `${i + 1}. ${q.text}${q.rationale ? ` — Rationale: ${q.rationale}` : ''}`).join('\n')}`);
    }
    if (parts.length === 0) {
      dispatch({ type: 'ERROR_ADDED', message: 'No paper content or questions available to inject' });
      return;
    }
    doInject(parts.join('\n\n'), 'Paper Summary + Questions');
  }, [paper, questions, doInject, dispatch]);

  const handleSendComments = useCallback(() => {
    if (paper.comments.length === 0) {
      dispatch({ type: 'ERROR_ADDED', message: 'No document comments available to inject' });
      return;
    }
    const commentsText = paper.comments.map((c) =>
      `[${c.author}]: "${c.comment}"${c.anchored_text ? ` (on: "${c.anchored_text.slice(0, 80)}")` : ''}`
    ).join('\n');
    doInject(`DOCUMENT REVIEW COMMENTS:\n${commentsText}`, 'Comments');
  }, [paper.comments, doInject, dispatch]);

  return (
    <div>
      <textarea
        className="textarea"
        rows={3}
        value={injectText}
        onChange={(e) => dispatch({ type: 'INJECT_TEXT_CHANGED', text: e.target.value })}
        placeholder="Type or paste context to send to Kira..."
        style={{ marginBottom: 8, fontSize: 12 }}
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSendCustom}
          disabled={isInjecting || !injectText.trim()}
          style={{ flex: '1 1 auto' }}
        >
          {isInjecting ? <span className="spinner spinner-sm" /> : '📤'}
          Send to Kira
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleSendPaperSummary}
          disabled={isInjecting || (!paper.summary && !paper.text)}
          style={{ flex: 1 }}
          title={!paper.summary && !paper.text ? 'Upload and analyze a paper first' : 'Inject paper summary'}
        >
          📄 Send Paper Summary
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleSendComments}
          disabled={isInjecting || paper.comments.length === 0}
          style={{ flex: 1 }}
          title={paper.comments.length === 0 ? 'No comments extracted from document' : 'Inject document comments'}
        >
          💬 Send Comments
        </button>
      </div>

      {/* Injection count indicator */}
      {contextInjections.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, textAlign: 'center' }}>
          {contextInjections.length} context injection{contextInjections.length !== 1 ? 's' : ''} sent this session
        </div>
      )}
    </div>
  );
}
