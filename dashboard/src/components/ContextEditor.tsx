import { useState, useCallback } from 'react';
import type { DashboardAction, ContextInjection } from '../types';
import * as api from '../api/client';

interface ContextEditorProps {
  systemPrompt: string;
  isInCall: boolean;
  contextInjections: ContextInjection[];
  dispatch: React.Dispatch<DashboardAction>;
}

export function ContextEditor({ systemPrompt, isInCall, contextInjections, dispatch }: ContextEditorProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isLoading, setIsLoading] = useState(false);

  const handleSyncToHeygen = useCallback(async () => {
    if (!systemPrompt.trim()) return;
    setIsSyncing(true);
    setSyncStatus('idle');
    try {
      await api.updateHeygenContext({
        name: 'Kira Meeting Context',
        prompt: systemPrompt,
        opening_text: "Hi, I'm Kira, your Amazonian AI. I've reviewed the paper and I'm ready to discuss it.",
      });
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } finally {
      setIsSyncing(false);
    }
  }, [systemPrompt]);

  const handleLoadFromHeygen = useCallback(async () => {
    setIsLoading(true);
    try {
      const ctx = await api.getHeygenContext();
      if (ctx.prompt) {
        dispatch({ type: 'SETTINGS_CHANGED', settings: { systemPrompt: ctx.prompt } });
      }
    } catch {
      // Silently fail — user can try again
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  return (
    <div className="context-editor">
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {isInCall
          ? 'Read-only view of the context sent to HeyGen. Use "Send Context" to inject more during the call.'
          : 'System prompt for Kira\'s personality during the meeting.'}
      </p>
      <textarea
        className="textarea"
        rows={5}
        value={systemPrompt}
        onChange={(e) => dispatch({ type: 'SETTINGS_CHANGED', settings: { systemPrompt: e.target.value } })}
        placeholder="You are Kira, an AI Principal Solutions Architect..."
        readOnly={isInCall}
        style={isInCall ? { opacity: 0.7, cursor: 'default' } : undefined}
      />
      {!isInCall && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleLoadFromHeygen}
            disabled={isLoading}
            style={{ flex: 1 }}
          >
            {isLoading ? (
              <><span className="spinner spinner-sm" /> Loading...</>
            ) : (
              '⬇️ Load from HeyGen'
            )}
          </button>
          <button
            className={`btn btn-sm ${syncStatus === 'success' ? 'btn-primary' : syncStatus === 'error' ? 'btn-secondary' : 'btn-secondary'}`}
            onClick={handleSyncToHeygen}
            disabled={isSyncing || !systemPrompt.trim()}
            style={{ flex: 1 }}
          >
            {isSyncing ? (
              <><span className="spinner spinner-sm" /> Syncing...</>
            ) : syncStatus === 'success' ? (
              '✓ Synced!'
            ) : syncStatus === 'error' ? (
              '✕ Failed'
            ) : (
              '⬆️ Sync to HeyGen'
            )}
          </button>
        </div>
      )}
      {!isInCall && (
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
          Context is auto-synced to HeyGen when joining a meeting. Use the buttons above for manual sync.
        </p>
      )}

      {/* Context Injection Log — shown during and after a call */}
      {contextInjections.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-muted)', paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            📋 Context Injections ({contextInjections.length})
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {contextInjections.map((inj) => (
              <div
                key={inj.id}
                style={{
                  padding: '5px 8px',
                  marginBottom: 3,
                  borderRadius: 4,
                  background: 'var(--bg-secondary)',
                  fontSize: 11,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>
                    {inj.label || 'Custom'}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                    {new Date(inj.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-word' }}>
                  {inj.preview}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
