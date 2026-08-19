import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { FaFileImport, FaFileWord, FaPrint, FaSpinner } from 'react-icons/fa';
import AppLayout from '../layout/AppLayout';
import { Toolbar } from '../components/Toolbar';
import { getDocument, updateDocument } from '../../application/services/documentService';
import { exportDocumentToDocx, importDocumentFromDocx } from '../../application/services/docxService';
import type { Document } from '../../domain/models/DocumentModel';

const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Image,
  TableKit.configure({ table: { resizable: true } }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [document, setDocument] = useState<Document | null>(null);
  const [title, setTitle] = useState('Untitled');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    immediatelyRender: false,
    onUpdate: () => {
      setSaveStatus('dirty');
      scheduleSave();
    },
  });

  const docRef = useRef<Document | null>(null);
  const titleRef = useRef(title);
  const timerRef = useRef<number | null>(null);
  const saveInFlight = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    docRef.current = document;
  }, [document]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  // Load document
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getDocument(id)
      .then((doc) => {
        if (cancelled) return;
        setDocument(doc);
        setTitle(doc.title || 'Untitled');
      })
      .catch(() => {
        if (!cancelled) setLoadError('Document not found');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Push loaded content into the editor once ready
  useEffect(() => {
    if (editor && document) {
      editor.commands.setContent(document.content || '<p></p>');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, document?.id]);

  const save = useCallback(async () => {
    const doc = docRef.current;
    if (!doc || !editor) return;
    if (saveInFlight.current) {
      pending.current = true;
      return;
    }
    saveInFlight.current = true;
    setSaveStatus('saving');
    try {
      await updateDocument({
        ...doc,
        title: titleRef.current,
        content: editor.getHTML(),
      });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('dirty');
    } finally {
      saveInFlight.current = false;
      if (pending.current) {
        pending.current = false;
        save();
      }
    }
  }, [editor]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => save(), 1500);
  }, [save]);

  // Save on unmount / page hide
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (saveStatus === 'dirty') save();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      flush();
    };
  }, [save, saveStatus]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setSaveStatus('dirty');
    scheduleSave();
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    setImporting(true);
    try {
      const html = await importDocumentFromDocx(file);
      editor.commands.setContent(html || '<p></p>');
      const name = file.name.replace(/\.docx$/i, '');
      if (name) setTitle(name);
      setSaveStatus('dirty');
      scheduleSave();
    } catch {
      window.alert('Could not import this Word document.');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    const doc = docRef.current;
    if (!doc) return;
    setExporting(true);
    try {
      await save();
      const fresh = await getDocument(doc.id);
      await exportDocumentToDocx({ ...fresh, title: titleRef.current });
    } catch {
      window.alert('Could not export the document.');
    } finally {
      setExporting(false);
    }
  };

  const statusLabel =
    saveStatus === 'saving' ? (
      <span className="flex items-center gap-1.5">
        <FaSpinner className="animate-spin" /> Saving…
      </span>
    ) : saveStatus === 'dirty' ? (
      'Unsaved changes'
    ) : saveStatus === 'saved' ? (
      'Saved'
    ) : (
      'Ready'
    );

  return (
    <AppLayout editor={editor}>
      <div className="min-h-full flex flex-col items-center pb-24 editor-workspace">
        {/* Document header */}
        <div className="w-full max-w-[210mm] px-6 pt-8 no-print">
          <div className="flex items-center gap-3 mb-2">
            <input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Untitled"
              className="flex-1 bg-transparent text-3xl font-bold text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="p-2.5 rounded-xl bg-surface border border-[var(--border)] text-ink-muted hover:text-ink hover:bg-soft transition-colors disabled:opacity-60"
                title="Import Word document (.docx)"
              >
                {importing ? <FaSpinner className="animate-spin" /> : <FaFileImport />}
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="p-2.5 rounded-xl bg-surface border border-[var(--border)] text-ink-muted hover:text-ink hover:bg-soft transition-colors disabled:opacity-60"
                title="Download as Word document (.docx)"
              >
                {exporting ? <FaSpinner className="animate-spin" /> : <FaFileWord />}
              </button>
              <button
                onClick={() => window.print()}
                className="p-2.5 rounded-xl bg-surface border border-[var(--border)] text-ink-muted hover:text-ink hover:bg-soft transition-colors"
                title="Print / export to PDF"
              >
                <FaPrint />
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleImport}
          />
          <div className="flex items-center gap-2 text-xs text-ink-faint mb-4">
            <span className={`w-1.5 h-1.5 rounded-full ${saveStatus === 'dirty' ? 'bg-amber-400' : saveStatus === 'saving' ? 'bg-accent' : saveStatus === 'saved' ? 'bg-success' : 'bg-ink-faint'}`} />
            {statusLabel}
          </div>
        </div>

        {/* Toolbar */}
        <div className="sticky top-0 z-50 w-full max-w-[210mm] px-4 pt-2 pb-4 bg-gradient-to-b from-workspace via-workspace/95 to-transparent no-print">
          <Toolbar editor={editor} />
        </div>

        {/* Editor page */}
        {loading ? (
          <div className="w-full max-w-[210mm] px-6 py-20 flex justify-center text-ink-muted">
            <span className="flex items-center gap-2">
              <FaSpinner className="animate-spin" /> Loading document…
            </span>
          </div>
        ) : loadError ? (
          <div className="w-full max-w-[210mm] px-6 py-20 text-center text-danger">
            {loadError}
          </div>
        ) : (
          <div className="bdoc-page">
            <EditorContent editor={editor} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}