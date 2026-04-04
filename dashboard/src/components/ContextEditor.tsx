import type { DashboardAction } from '../types';

interface ContextEditorProps {
  systemPrompt: string;
  dispatch: React.Dispatch<DashboardAction>;
}

export function ContextEditor({ systemPrompt, dispatch }: ContextEditorProps) {
  return (
    <div className="context-editor">
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
        System prompt for Kira's personality during the meeting.
      </p>
      <textarea
        className="textarea"
        rows={5}
        value={systemPrompt}
        onChange={(e) => dispatch({ type: 'SETTINGS_CHANGED', settings: { systemPrompt: e.target.value } })}
        placeholder="You are Kira, an AI Principal Solutions Architect..."
      />
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        Leave empty to use the server default prompt.
      </p>
    </div>
  );
}
