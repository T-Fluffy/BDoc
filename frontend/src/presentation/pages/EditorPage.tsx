import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Node, Editor } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { FaSpinner } from 'react-icons/fa';
import AppLayout from '../layout/AppLayout';
import { Toolbar } from '../components/Toolbar';
import { getDocument, updateDocument } from '../../application/services/documentService';
import { exportDocumentToDocx, importDocumentFromDocx } from '../../application/services/docxService';
import { useDocuments } from '../../application/usecases/useDocument';
import type { Document } from '../../domain/models/DocumentModel';
import {
  DEFAULT_PAGE_SETTINGS,
  PAGE_DIMENSIONS_MM,
  MARGIN_MM,
  parsePageSettings,
  type PageSettings,
} from '../../domain/models/PageSettings';

const TextStyleExt = TextStyle.extend({
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

const blockSpacingAttrs = () => ({
  lineHeight: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.lineHeight || null,
    renderHTML: (attributes: Record<string, string>) =>
      attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
  },
  marginTop: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.marginTop || null,
    renderHTML: (attributes: Record<string, string>) =>
      attributes.marginTop ? { style: `margin-top: ${attributes.marginTop}` } : {},
  },
  marginBottom: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.marginBottom || null,
    renderHTML: (attributes: Record<string, string>) =>
      attributes.marginBottom ? { style: `margin-bottom: ${attributes.marginBottom}` } : {},
  },
  textIndent: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.textIndent || null,
    renderHTML: (attributes: Record<string, string>) =>
      attributes.textIndent ? { style: `text-indent: ${attributes.textIndent}` } : {},
  },
  paddingLeft: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.paddingLeft || null,
    renderHTML: (attributes: Record<string, string>) =>
      attributes.paddingLeft ? { style: `padding-left: ${attributes.paddingLeft}` } : {},
  },
});

const ParagraphSpacing = Paragraph.extend({ addAttributes: blockSpacingAttrs });
const HeadingSpacing = Heading.extend({ addAttributes: blockSpacingAttrs });

// Invisible spacer node that marks a page boundary (keeps content from spilling
// into the gap/margins between sheets). Height is driven by --page-gap so it
// matches the on-screen sheet geometry.
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  parseHTML() {
    return [{ tag: 'div.page-break' }];
  },
  renderHTML() {
    return ['div', { class: 'page-break', 'data-page-break': 'true' }];
  },
});

const GAP_MM = 12;
const PX_PER_MM = 96 / 25.4;

// Remove the visual-only page-break spacers before persisting/exporting content.
function stripPageBreaks(html: string): string {
  if (typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('.page-break').forEach((el) => el.remove());
  return div.innerHTML;
}

const extensions = [
  StarterKit.configure({ heading: false, paragraph: false }),
  ParagraphSpacing,
  HeadingSpacing.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  Image,
  TableKit.configure({ table: { resizable: true } }),
  TextStyleExt,
  FontFamily,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  PageBreak,
];

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { create } = useDocuments();
  const [document, setDocument] = useState<Document | null>(null);
  const [title, setTitle] = useState('Untitled');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettings>(DEFAULT_PAGE_SETTINGS);
  const pageSettingsRef = useRef<PageSettings>(DEFAULT_PAGE_SETTINGS);
  const [pageCount, setPageCount] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const isComposingRef = useRef(false);
  const lastPaginateDispatchRef = useRef<number>(0);

  // Real pagination: insert/remove invisible page-break spacers so content breaks
  // onto the next sheet (with margins + gap) instead of spilling into the gaps.
  const paginate = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const view = editor.view;
    const pm = view.dom as HTMLElement;
    const s = pageSettingsRef.current;
    const dims = PAGE_DIMENSIONS_MM[s.size];
    const pageH = s.orientation === 'landscape' ? dims.w : dims.h;
    const pageM = MARGIN_MM[s.margins];
    const innerPx = Math.max(1, (pageH - 2 * pageM) * PX_PER_MM);
    const domChildren = Array.from(pm.children) as HTMLElement[];
    const { doc, schema } = editor.state;
    if (domChildren.length !== doc.childCount) {
      window.setTimeout(() => paginate(), 60);
      return;
    }

    // Measure every content block's height, then compute the ideal page breaks
    // with a greedy packer. This depends ONLY on block heights (not on where
    // breaks currently are), so it is idempotent: re-running after breaks are
    // inserted yields the same result — no oscillation / runaway page creation.
    const heights: number[] = [];
    for (let i = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      if (node.type.name === 'pageBreak') continue; // spacer, not content
      const el = domChildren[i];
      let h = 0;
      if (el) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        h = r.height + parseFloat(cs.marginTop || '0') + parseFloat(cs.marginBottom || '0');
      }
      heights.push(h);
    }
    const desiredBreaks = new Set<number>();
    let used = 0;
    for (let i = 0; i < heights.length; i++) {
      if (i > 0 && used + heights[i] > innerPx) {
        desiredBreaks.add(i);
        used = 0;
      }
      used += heights[i];
    }

    // Current leading breaks expressed as content indices.
    const currentBreaks = new Set<number>();
    let cj = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      if (node.type.name === 'pageBreak') {
        currentBreaks.add(cj);
        continue;
      }
      cj++;
    }
    // Idempotent check: if the desired breaks are the same as the current ones,
    // there is nothing to do — skip dispatch and setPageCount to avoid a loop.
    const same = currentBreaks.size === desiredBreaks.size && [...currentBreaks].every((c) => desiredBreaks.has(c));
    if (same) return;

    // Guard: skip pagination dispatch if user is composing (IME) or if we dispatched
    // too recently (prevents rapid re-dispatch loops that can interfere with typing).
    const now = Date.now();
    if (isComposingRef.current) return;
    if (now - lastPaginateDispatchRef.current < 500) {
      window.setTimeout(() => paginate(), 500);
      return;
    }

    // The number of pages is exactly (breaks + 1); drive the sheet stack from this
    // instead of a scrollHeight measurement (which was off by one).
    setPageCount((prev) => {
      const next = desiredBreaks.size + 1;
      return prev === next ? prev : next;
    });

    // Remove all existing page breaks (last to first so positions stay valid).
    // Top-level doc content is indexed from 0 (the doc's own tokens are not
    // counted), so the first child starts at position 0.
    let tr = editor.state.tr;
    let pos = 0;
    const delPos: number[] = [];
    for (let i = 0; i < doc.childCount; i++) {
      const before = pos;
      const node = doc.child(i);
      if (node.type.name === 'pageBreak') delPos.push(before);
      pos += node.nodeSize;
    }
    for (let k = delPos.length - 1; k >= 0; k--) {
      tr = tr.delete(delPos[k], delPos[k] + 1);
    }

    // Position before each content node (in the now break-free doc), then insert
    // the desired breaks from highest position to lowest.
    let running = 0;
    const posBeforeContent: Record<number, number> = {};
    let ck = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      if (node.type.name === 'pageBreak') continue;
      posBeforeContent[ck] = running;
      running += node.nodeSize;
      ck++;
    }
    const desired = Array.from(desiredBreaks).sort((a, b) => b - a);
    for (const c of desired) {
      const p = posBeforeContent[c];
      if (typeof p === 'number') {
        tr = tr.insert(p, schema.nodes.pageBreak.create());
      }
    }
    if (tr.docChanged) {
      lastPaginateDispatchRef.current = Date.now();
      editor.view.dispatch(tr);
    }
  }, [setPageCount]);

  const paginateTimer = useRef<number | null>(null);
  const schedulePaginate = useCallback(() => {
    if (paginateTimer.current) window.clearTimeout(paginateTimer.current);
    paginateTimer.current = window.setTimeout(() => paginate(), 120);
  }, [paginate]);

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    immediatelyRender: false,
    onUpdate: () => {
      setSaveStatus('dirty');
      scheduleSave();
      schedulePaginate();
    },
  });
  editorRef.current = editor;

  // Track IME composition to avoid paginating during active composition
  useEffect(() => {
    if (!editor) return;
    const view = editor.view;
    const dom = view.dom;
    const onCompositionStart = () => { isComposingRef.current = true; };
    const onCompositionEnd = () => { isComposingRef.current = false; };
    dom.addEventListener('compositionstart', onCompositionStart);
    dom.addEventListener('compositionend', onCompositionEnd);
    return () => {
      dom.removeEventListener('compositionstart', onCompositionStart);
      dom.removeEventListener('compositionend', onCompositionEnd);
    };
  }, [editor]);

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
        const parsed = parsePageSettings(doc.settings);
        setPageSettings(parsed);
        pageSettingsRef.current = parsed;
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
      window.setTimeout(schedulePaginate, 120);
      window.setTimeout(schedulePaginate, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, document?.id]);

  // Re-paginate after images load (height changes without an editor update) and
  // when the viewport (column width) changes.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onMedia = () => schedulePaginate();
    dom.addEventListener('load', onMedia, true);
    const onResize = () => schedulePaginate();
    window.addEventListener('resize', onResize);
    return () => {
      dom.removeEventListener('load', onMedia, true);
      window.removeEventListener('resize', onResize);
    };
  }, [editor, schedulePaginate]);

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
        content: stripPageBreaks(editor.getHTML()),
        settings: JSON.stringify(pageSettingsRef.current),
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

  const handlePageSettingsChange = (next: PageSettings) => {
    setPageSettings(next);
    pageSettingsRef.current = next;
    setSaveStatus('dirty');
    scheduleSave();
    window.setTimeout(schedulePaginate, 0);
    window.setTimeout(schedulePaginate, 250);
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    setImporting(true);
    try {
      const html = await importDocumentFromDocx(file);
      const name = file.name.replace(/\.docx$/i, '');
      const doc = await create(name);
      await editor.commands.setContent(html || '<p></p>');
      navigate(`/editor/${doc.id}`);
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
      await exportDocumentToDocx({
        ...fresh,
        title: titleRef.current,
        content: stripPageBreaks(fresh.content || ''),
      });
    } catch {
      window.alert('Could not export the document.');
    } finally {
      setExporting(false);
    }
  };

  const handleNew = async () => {
    const doc = await create('Untitled document');
    navigate(`/editor/${doc.id}`);
  };

  const handleClose = () => {
    navigate('/');
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

  const gapMm = GAP_MM;
  const dims = PAGE_DIMENSIONS_MM[pageSettings.size];
  const pageW = pageSettings.orientation === 'landscape' ? dims.h : dims.w;
  const pageH = pageSettings.orientation === 'landscape' ? dims.w : dims.h;
  const pageM = MARGIN_MM[pageSettings.margins];
  const unitMm = pageH + gapMm;
  const stackHeightMm = Math.max(pageH, pageCount * pageH + Math.max(0, pageCount - 1) * gapMm);
  const spacerPx = (2 * pageM + gapMm) * PX_PER_MM;

  return (
    <AppLayout
      editor={editor}
      onNew={handleNew}
      onImport={() => fileInputRef.current?.click()}
      onExport={handleExport}
      onPrint={() => window.print()}
      onCloseDocument={handleClose}
      exporting={exporting}
      importing={importing}
      pageSettings={pageSettings}
      onPageSettingsChange={handlePageSettingsChange}
    >
      <div className="editor-workspace min-h-full overflow-auto pb-16">
        <div className="mx-auto flex flex-col items-stretch" style={{ width: `${pageW}mm` }}>
          {/* Document header */}
          <div className="px-6 pt-8 no-print">
            <div className="flex items-center gap-3 mb-2">
              <input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Untitled"
                className="flex-1 bg-transparent text-3xl font-bold text-ink placeholder:text-ink-faint focus:outline-none"
              />
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
          <div className="sticky top-0 z-50 px-4 pt-2 pb-4 bg-gradient-to-b from-workspace via-workspace/95 to-transparent no-print">
            <Toolbar editor={editor} />
          </div>

          {/* Paginated document */}
          {loading ? (
            <div className="px-6 py-20 flex justify-center text-ink-muted">
              <span className="flex items-center gap-2">
                <FaSpinner className="animate-spin" /> Loading document…
              </span>
            </div>
          ) : loadError ? (
            <div className="px-6 py-20 text-center text-danger">
              {loadError}
            </div>
          ) : (
            <div className="relative w-full" style={{ height: `${stackHeightMm}mm` }}>
              {Array.from({ length: pageCount }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden
                  className="page-sheet absolute left-0 top-0 bg-[var(--page-bg)] border border-[var(--border)] rounded-[2px] shadow-[var(--shadow-lg)] pointer-events-none"
                  style={{
                    top: `${i * unitMm}mm`,
                    height: `${pageH}mm`,
                    width: `${pageW}mm`,
                    padding: `${pageM}mm`,
                  }}
                />
              ))}
              <div
                className="bdoc-page absolute left-0 top-0"
                style={{
                  width: `${pageW}mm`,
                  height: `${stackHeightMm}mm`,
                  padding: `${pageM}mm ${pageM}mm 0 ${pageM}mm`,
                  background: 'transparent',
                  minHeight: 0,
                  boxShadow: 'none',
                  borderRadius: 0,
                  overflow: 'visible',
                  ['--page-gap' as string]: `${spacerPx}px`,
                }}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}