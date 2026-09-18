import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

interface WordCountDialogProps {
  editor: Editor;
  pageCount: number;
  onClose: () => void;
}

export default function WordCountDialog({ editor, pageCount, onClose }: WordCountDialogProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    editor.on('update', bump);
    return () => {
      editor.off('update', bump);
    };
  }, [editor]);

  const text = editor.getText();
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;

  const rows: [string, string][] = [
    ['Pages', String(pageCount)],
    ['Words', String(words)],
    ['Characters', String(chars)],
    ['Characters excluding spaces', String(charsNoSpaces)],
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Word count"
        className="w-[min(360px,92vw)] rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">Word count</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
          >
            Done
          </button>
        </div>
        <dl className="space-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="text-ink font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-ink-faint mt-4">Counts update live as you edit.</p>
      </div>
    </div>
  );
}
