import { useState, useCallback, useRef } from 'react';
import type { DashboardState, DashboardAction } from '../types';
import * as api from '../api/client';

interface PaperUploadProps {
  paper: DashboardState['paper'];
  dispatch: React.Dispatch<DashboardAction>;
}

/**
 * Read a File as a base64 string (without the data URL prefix).
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:...;base64," prefix
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function PaperUpload({ paper, dispatch }: PaperUploadProps) {
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isBinary = ext === 'pdf' || ext === 'docx';

    if (isBinary) {
      // Use server-side extraction for PDF/DOCX (handles binary parsing + comments)
      dispatch({ type: 'PAPER_EXTRACT_START' });
      try {
        const base64 = await readFileAsBase64(file);
        const result = await api.extractPaper(base64, file.name);
        dispatch({
          type: 'PAPER_EXTRACTED',
          text: result.text,
          fileName: file.name,
          comments: result.comments,
        });
      } catch (err) {
        dispatch({
          type: 'PAPER_EXTRACT_ERROR',
          error: (err as Error).message,
        });
      }
    } else {
      // Plain text files can be read directly in the browser
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        dispatch({ type: 'PAPER_TEXT_SET', text, fileName: file.name, comments: [] });
      };
      reader.readAsText(file);
    }
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
      dispatch({ type: 'PAPER_TEXT_SET', text: pasteText, fileName: 'Pasted text', comments: [] });
      setShowPasteArea(false);
    }
  }, [pasteText, dispatch]);

  if (paper.isExtracting) {
    return (
      <div className="paper-preview">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="spinner spinner-sm" />
          <span>Extracting text from file...</span>
        </div>
      </div>
    );
  }

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
        {paper.comments.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            💬 {paper.comments.length} comment{paper.comments.length !== 1 ? 's' : ''} extracted
          </div>
        )}
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
