import { useEffect, useState } from 'react';
import {
  acceptSuggestion,
  getSuggestions,
  rejectSuggestion,
  type Suggestion,
} from '../../application/services/documentService';
import type { Document } from '../../domain/models/DocumentModel';

interface Props {
  docId: string;
  isOwner: boolean;
  onClose: () => void;
  onApplied: (doc: Document) => void;
}

export default function SuggestionsDialog({ docId, isOwner, onClose, onApplied }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refresh = async () => {
    try {
      setSuggestions(await getSuggestions(docId));
    } catch {
      setError('Could not load suggestions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const describe = (e: unknown): string => {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 409) {
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      return typeof data === 'string' && data ? data : 'Suggestion is stale.';
    }
    return 'Action failed.';
  };

  const handleAccept = async (s: Suggestion) => {
    setError(null);
    try {
      const doc = await acceptSuggestion(docId, s.id);
      onApplied(doc);
      await refresh();
    } catch (e) {
      setError(describe(e));
      await refresh();
    }
  };

  const handleReject = async (s: Suggestion) => {
    setError(null);
    try {
      await rejectSuggestion(docId, s.id);
      await refresh();
    } catch (e) {
      setError(describe(e));
      await refresh();
    }
  };

  const pending = suggestions.filter((s) => s.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Suggestions"
        className="w-[min(560px,95vw)] max-h-[85vh] flex flex-col rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-ink">
            Suggestions{pending > 0 ? ` (${pending} pending)` : ''}
          </h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
          >
            Close
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {loading && <div className="text-sm text-ink-faint">Loading…</div>}
          {error && <div className="mb-3 text-sm text-danger">{error}</div>}
          {!loading && suggestions.length === 0 && (
            <div className="text-sm text-ink-faint">No suggestions yet.</div>
          )}
          {suggestions.map((s) => (
            <div key={s.id} className="mb-3 rounded-lg border border-[var(--border)] bg-surface p-3">
              <div className="text-xs text-ink-faint mb-1">
                {s.authorEmail} · {new Date(s.createdAt).toLocaleString()} ·{' '}
                <span className={s.status === 'pending' ? 'text-accent font-semibold' : ''}>{s.status}</span>
              </div>
              <div className="text-sm text-ink-muted line-through decoration-danger/60">{s.quote}</div>
              <div className="text-sm text-ink mt-1">→ {s.replacement}</div>
              {isOwner && s.status === 'pending' && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void handleAccept(s)}
                    className="px-3 py-1 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => void handleReject(s)}
                    className="px-3 py-1 rounded-lg text-sm text-ink-muted hover:bg-soft transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
