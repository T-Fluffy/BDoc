import { useLocation, useNavigate } from 'react-router-dom';
import { FaFileAlt, FaPlus, FaTimes, FaWindowClose } from 'react-icons/fa';
import { useDocuments } from '../../application/usecases/useDocument';
import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { documents, loading, create, remove } = useDocuments();
  const [creating, setCreating] = useState(false);

  const isEditing = location.pathname.includes('/editor/');

  const handleCreate = async () => {
    setCreating(true);
    try {
      const doc = await create('Untitled document');
      navigate(`/editor/${doc.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this document?')) return;
    await remove(id);
    if (location.pathname.includes(id)) navigate('/');
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden bg-black/40" onClick={onClose} />
      )}

      <aside
        className={`fixed lg:static top-16 bottom-0 left-0 z-50 w-72 shrink-0 flex flex-col bg-canvas border-r border-[var(--border)] transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-faint">
            Library
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-soft transition-colors"
              title="New document"
            >
              <FaPlus size={12} />
            </button>
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-soft transition-colors"
              title="Close sidebar"
            >
              <FaTimes size={12} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          {loading && (
            <div className="px-3 py-2 text-sm text-ink-faint animate-pulse">
              Loading documents…
            </div>
          )}

          {!loading && documents.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-ink-faint">
              <FaFileAlt className="mx-auto mb-2 opacity-40" size={24} />
              No documents yet.
            </div>
          )}

          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center rounded-lg hover:bg-soft transition-colors"
            >
              <button
                onClick={() => {
                  navigate(`/editor/${doc.id}`);
                  onClose();
                }}
                className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink-muted hover:text-ink transition-colors text-left min-w-0"
              >
                <FaFileAlt size={12} className="shrink-0 text-ink-faint group-hover:text-accent" />
                <span className="truncate">{doc.title || 'Untitled'}</span>
              </button>
              <button
                onClick={() => handleDelete(doc.id)}
                className="p-2 mr-1 rounded-md text-ink-faint opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger-soft transition-all shrink-0"
                title="Delete document"
              >
                <FaTimes size={11} />
              </button>
            </div>
          ))}
        </div>

        {isEditing && (
          <div className="px-3 pb-3 pt-2 border-t border-[var(--border)]">
            <button
              onClick={() => {
                navigate('/');
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink-muted hover:bg-soft hover:text-ink transition-colors"
              title="Close the current document"
            >
              <FaWindowClose size={13} className="shrink-0 text-ink-faint" />
              Close document
            </button>
          </div>
        )}
      </aside>
    </>
  );
}