import { useState, useCallback, useRef } from 'react';
import type { DashboardState, DashboardAction } from '../types';

interface PaperUploadProps {
  paper: DashboardState['paper'];
  dispatch: React.Dispatch<DashboardAction>;
}

export function PaperUpload({ paper, dispatch }: PaperUploadProps) {
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      dispatch({ type: 'PAPER_TEXT_SET', text, fileName: file.name });
    };
    reader.readAsText(file);
  }, [dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handlePaste = useCallback(() => {
    if (pasteText.trim()) {
      dispatch({ type: 'PAPER_TEXT_SET', text: pasteText, fileName: 'Pasted text' });
      setShowPasteArea(false);
    }
  }, [pasteText, dispatch]);

  if (paper.text) {
    return (
      <div className="paper-preview">
        <div className="paper-file-info">
          <span className="paper-file-name">{paper.fileName ?? 'Paper'}</span>
          <span className="paper-file-check">✓</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
            {paper.text.length.toLocaleString()} chars
          </span>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => dispatch({ type: 'PAPER_CLEARED' })}
          style={{ alignSelf: 'flex-start' }}
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
        />
        <div className="drop-zone-text">
          <strong>Drop file here</strong> or click to browse
        </div>
        <div className="drop-zone-hint">PDF, DOCX, TXT supported</div>
      </div>

      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowPasteArea(!showPasteArea)}
        >
          {showPasteArea ? 'Hide paste area' : '📋 Or paste text'}
        </button>
      </div>

      {showPasteArea && (
        <div style={{ marginTop: 8 }}>
          <textarea
            className="textarea"
            rows={6}
            placeholder="Paste paper text here..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handlePaste}
            disabled={!pasteText.trim()}
            style={{ marginTop: 6, width: '100%' }}
          >
            Use This Text
          </button>
        </div>
      )}
    </div>
  );
}
