import { useEffect, useState } from 'react';
import { addShare, getShares, revokeShare, type ShareInfo } from '../../application/services/documentService';

interface Props {
  docId: string;
  onClose: () => void;
}

export default function ShareDialog({ docId, onClose }: Props) {
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('viewer');
  const [busy, setBusy] = useState(false);
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
      setShares(await getShares(docId));
    } catch {
      setError('Could not load sharing settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const describe = (e: unknown): string => {
    const status = (e as { response?: { status?: number; data?: unknown } })?.response?.status;
    const data = (e as { response?: { data?: unknown } })?.response?.data;
    if (status === 404) return typeof data === 'string' && data ? data : 'No user with that email.';
    if (typeof data === 'string' && data) return data;
    return 'Could not update sharing settings.';
  };

  const handleAdd = async () => {
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addShare(docId, value, permission);
      setEmail('');
      await refresh();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRole = async (userId: string, userEmail: string, next: string) => {
    setError(null);
    try {
      await addShare(docId, userEmail, next);
      await refresh();
    } catch (e) {
      setError(describe(e));
    }
  };

  const handleRevoke = async (userId: string) => {
    setError(null);
    try {
      await revokeShare(docId, userId);
      await refresh();
    } catch {
      setError('Could not revoke access.');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Share document"
        className="w-[min(520px,95vw)] max-h-[85vh] flex flex-col rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-ink">Share document</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
          >
            Close
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
              placeholder="name@example.com"
              aria-label="Email to share with"
              spellCheck={false}
              className="flex-1 min-w-0 bg-surface border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              aria-label="Permission"
              className="bg-surface border border-[var(--border)] rounded-lg px-2 py-2 text-sm text-ink focus:outline-none"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              onClick={() => void handleAdd()}
              disabled={busy || !email.trim()}
              className="px-4 py-2 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {busy ? 'Sharing…' : 'Share'}
            </button>
          </div>
          {error && <div className="mt-3 text-sm text-danger">{error}</div>}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-2">Who has access</h3>
            {loading && <div className="text-sm text-ink-faint">Loading…</div>}
            {!loading && shares.length === 0 && (
              <div className="text-sm text-ink-faint">Only you. Add someone above to share.</div>
            )}
            {shares.map((s) => (
              <div key={s.userId} className="flex items-center gap-2 py-2 border-b border-[var(--border)] last:border-0">
                <span className="flex-1 min-w-0 truncate text-sm text-ink">{s.email}</span>
                <select
                  value={s.permission}
                  onChange={(e) => void handleRole(s.userId, s.email, e.target.value)}
                  aria-label={`Permission for ${s.email}`}
                  className="bg-surface border border-[var(--border)] rounded-lg px-2 py-1 text-sm text-ink focus:outline-none"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  onClick={() => void handleRevoke(s.userId)}
                  title={`Revoke access for ${s.email}`}
                  className="px-2 py-1 rounded-lg text-sm text-ink-faint hover:text-danger hover:bg-danger-soft transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
