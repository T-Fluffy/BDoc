import { useEffect } from 'react';

interface HelpDialogProps {
  onClose: () => void;
}

// Only bindings verified against the editor — every row below was checked.
const SHORTCUTS: [string, string][] = [
  ['Ctrl/⌘ + B', 'Bold'],
  ['Ctrl/⌘ + I', 'Italic'],
  ['Ctrl/⌘ + U', 'Underline'],
  ['Ctrl/⌘ + Z', 'Undo'],
  ['Ctrl/⌘ + Y', 'Redo'],
  ['Ctrl/⌘ + A', 'Select all'],
  ['Ctrl/⌘ + H', 'Find and replace'],
  ['Ctrl/⌘ + S', 'Save now'],
];

const EDITING_NOTES: [string, string][] = [
  ['Enter', 'New paragraph'],
  ['Double-click header/footer', 'Edit header & footer'],
  ['Click between pages', 'Caret jumps to the nearest text'],
];

export default function HelpDialog({ onClose }: HelpDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="w-[min(480px,92vw)] max-h-[85vh] overflow-auto rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
          >
            Done
          </button>
        </div>
        <dl className="space-y-1.5">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="flex items-center justify-between text-sm gap-4">
              <dt className="text-ink-muted">{what}</dt>
              <dd className="text-ink font-mono text-xs bg-soft rounded px-1.5 py-0.5 whitespace-nowrap">{keys}</dd>
            </div>
          ))}
        </dl>
        <h3 className="text-xs font-semibold text-ink mt-5 mb-2">Editing tips</h3>
        <dl className="space-y-1.5">
          {EDITING_NOTES.map(([keys, what]) => (
            <div key={keys} className="flex items-center justify-between text-sm gap-4">
              <dt className="text-ink-muted">{what}</dt>
              <dd className="text-ink font-mono text-xs bg-soft rounded px-1.5 py-0.5 whitespace-nowrap">{keys}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 pt-3 border-t border-[var(--border)]">
          <p className="text-sm font-semibold text-ink">BDoc</p>
          <p className="text-xs text-ink-faint mt-1">
            Paginated document editor — rich text on A4-style sheets with Word (.docx) import and export.
          </p>
        </div>
      </div>
    </div>
  );
}
