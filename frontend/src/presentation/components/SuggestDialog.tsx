import { useEffect, useState } from 'react';
import { addSuggestion } from '../../application/services/documentService';

interface Props {
  docId: string;
  quote: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function SuggestDialog({ docId, quote, onClose, onSubmitted }: Props) {
  const [replacement, setReplacement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!quote.trim() || !replacement.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addSuggestion(docId, quote, replacement);
      onSubmitted();
    } catch (e) {
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      setError(typeof data === 'string' && data ? data : 'Could not submit the suggestion.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Suggest a change"
        className="w-[min(520px,95vw)] rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-ink">Suggest a change</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
          >
            Close
          </button>
        </div>
        <div className="p-5">
          {!quote.trim() && (
            <div className="mb-3 text-sm text-ink-muted">Select some text in the document first.</div>
          )}
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-1">Current text</div>
          <div className="text-sm text-ink-muted border border-[var(--border)] rounded-lg p-3 bg-surface mb-4 max-h-32 overflow-auto">
            {quote.trim() || <em>(nothing selected)</em>}
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-1">Proposed replacement</div>
          <textarea
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            aria-label="Proposed replacement"
            rows={4}
            placeholder="Write the replacement text…"
            className="w-full bg-surface border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          {error && <div className="mt-3 text-sm text-danger">{error}</div>}
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => void submit()}
              disabled={busy || !quote.trim() || !replacement.trim()}
              className="px-4 py-2 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {busy ? 'Submitting…' : 'Submit suggestion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
