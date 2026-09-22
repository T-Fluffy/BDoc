import { useEffect, useState } from 'react';
import { getVersions, restoreVersion, type DocumentVersion } from '../../application/services/documentService';

interface Props {
  docId: string;
  onClose: () => void;
  onRestored: () => void;
  readOnly?: boolean;
}

function timeAgo(s: string): string {
  const d = new Date(s);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function VersionHistoryDialog({ docId, onClose, onRestored, readOnly }: Props) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DocumentVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    getVersions(docId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [docId]);

  const handleRestore = async () => {
    if (!selected) return;
    if (!window.confirm(`Restore version from ${new Date(selected.createdAt).toLocaleString()}?`)) return;
    setRestoring(true);
    try {
      await restoreVersion(docId, selected.id);
      onRestored();
      onClose();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Version history"
        className="w-[min(720px,95vw)] max-h-[85vh] flex flex-col rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-ink">Version history</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
          >
            Close
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-56 shrink-0 border-r border-[var(--border)] overflow-y-auto">
            {loading && <div className="p-4 text-sm text-ink-faint">Loading…</div>}
            {!loading && versions.length === 0 && (
              <div className="p-4 text-sm text-ink-faint">No saved versions yet. Edit and save to create one.</div>
            )}
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--border)] hover:bg-soft transition-colors ${
                  selected?.id === v.id ? 'bg-accent-soft text-accent' : 'text-ink-muted'
                }`}
              >
                <div className="text-sm font-medium truncate">{v.title || 'Untitled'}</div>
                <div className="text-xs text-ink-faint">{timeAgo(v.createdAt)} — {new Date(v.createdAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {!selected && <div className="text-sm text-ink-faint">Select a version to preview.</div>}
            {selected && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-ink">Preview — {new Date(selected.createdAt).toLocaleString()}</h3>
                  {!readOnly && (
                    <button
                      onClick={handleRestore}
                      disabled={restoring}
                      className="px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50 transition-colors"
                    >
                      {restoring ? 'Restoring…' : 'Restore this version'}
                    </button>
                  )}
                </div>
                <div className="prose max-w-none text-sm border rounded-lg p-3 bg-surface max-h-[45vh] overflow-auto" dangerouslySetInnerHTML={{ __html: selected.content || '<p><em>(empty)</em></p>' }} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
