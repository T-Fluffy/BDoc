import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaClock, FaFileAlt, FaPlus, FaSearch, FaTrash } from 'react-icons/fa';
import AppLayout from '../layout/AppLayout';
import { useDocuments } from '../../application/usecases/useDocument';
import { importDocumentFromDocx } from '../../application/services/docxService';
import { createDocument, updateDocument } from '../../application/services/documentService';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { documents, loading, error, create, remove } = useDocuments();

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

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
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const html = await importDocumentFromDocx(file);
      const name = file.name.replace(/\.docx$/i, '') || 'Imported document';
      const doc = await createDocument(name);
      await updateDocument({ ...doc, content: html || '<p></p>', title: name });
      navigate(`/editor/${doc.id}`);
    } catch {
      window.alert('Could not import this Word document.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppLayout onNew={handleCreate} onImport={() => fileInputRef.current?.click()} importing={importing}>
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold text-ink">Your Library</h1>
            <p className="text-ink-muted text-sm mt-1">Manage and organize your documents.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={13} />
              <input
                type="text"
                placeholder="Search documents…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-surface border border-[var(--border)] rounded-xl py-2 pl-9 pr-4 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50 w-60 transition-all"
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-accent-contrast px-5 py-2.5 rounded-xl font-semibold text-sm shadow-[0_0_20px_var(--accent-soft)] transition-all active:scale-95 disabled:opacity-60"
            >
              <FaPlus size={12} />
              New Document
            </button>
          </div>
        </div>

        {/* Content */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 bg-surface rounded-2xl border border-[var(--border)] animate-pulse" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="py-20 text-center">
            <p className="text-danger mb-3">Failed to load documents.</p>
            <p className="text-sm text-ink-muted mb-4">{error}</p>
            <p className="text-xs text-ink-faint">
              Make sure the BDoc API is running (docker compose up).
            </p>
          </div>
        )}

        {!loading && !error && filteredDocs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-[var(--border)] rounded-3xl">
            <div className="text-ink-faint mb-4 text-5xl opacity-30">
              <FaFileAlt />
            </div>
            <p className="text-ink-muted">
              {searchQuery ? 'No documents match your search.' : 'No documents yet — create your first one.'}
            </p>
          </div>
        )}

        {!loading && !error && filteredDocs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => navigate(`/editor/${doc.id}`)}
                className="group relative bg-surface border border-[var(--border)] rounded-2xl p-5 hover:border-accent/40 hover:shadow-[var(--shadow-sm)] transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-accent-soft rounded-lg text-accent group-hover:scale-110 transition-transform">
                    <FaFileAlt size={18} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc.id);
                    }}
                    className="p-2 rounded-lg text-ink-faint opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger-soft transition-all"
                    title="Delete"
                  >
                    <FaTrash size={13} />
                  </button>
                </div>

                <h3 className="font-semibold text-ink mb-1 truncate group-hover:text-accent transition-colors">
                  {doc.title || 'Untitled'}
                </h3>

                <div className="flex items-center gap-2 text-xs text-ink-faint">
                  <FaClock size={10} />
                  <span>Edited {timeAgo(doc.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleImport} />
    </AppLayout>
  );
}