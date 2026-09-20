import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Node, Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Selection, TextSelection } from '@tiptap/pm/state';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TableKit } from '@tiptap/extension-table';
import ResizableImageView from '../components/ResizableImageView';
import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { CommentMark } from '../components/CommentMark';
import { FaSpinner } from 'react-icons/fa';
import AppLayout from '../layout/AppLayout';
import { Toolbar } from '../components/Toolbar';
import VersionHistoryDialog from '../components/VersionHistoryDialog';
import Ruler from '../components/Ruler';
import HeaderFooterDialog from '../components/HeaderFooterDialog';
import FindReplaceDialog from '../components/FindReplaceDialog';
import WordCountDialog from '../components/WordCountDialog';
import HelpDialog from '../components/HelpDialog';
import TableContextMenu from '../components/TableContextMenu';
import { getDocument, updateDocument } from '../../application/services/documentService';
import { exportDocumentToDocx, importDocumentFromDocx } from '../../application/services/docxService';
import { useDocuments } from '../../application/usecases/useDocument';
import type { Document } from '../../domain/models/DocumentModel';
import {
  DEFAULT_PAGE_SETTINGS,
  PAGE_DIMENSIONS_MM,
  ZOOM_PRESETS,
  ZOOM_STORAGE_KEY,
  parsePageSettings,
  resolveMarginMm,
  resolveHeaderFooter,
  headerFooterTextForPage,
  type PageSettings,
  type HeaderFooterSettings,
} from '../../domain/models/PageSettings';

const TextStyleExt = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
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
  tabStops: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const raw = element.dataset.tabStops;
      if (!raw) return null;
      const nums = [...new Set(
        raw
          .split(',')
          .map((s) => parseFloat(s))
          .filter((n) => Number.isFinite(n) && n >= 0 && n <= 500),
      )]
        .sort((a, b) => a - b)
        .slice(0, 24);
      return nums.length > 0 ? nums : null;
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const ts = attributes.tabStops;
      if (!Array.isArray(ts) || ts.length === 0) return {};
      return { 'data-tab-stops': (ts as number[]).join(',') };
    },
  },
});

const ParagraphSpacing = Paragraph.extend({
  addAttributes() {
    return { ...this.parent?.(), ...blockSpacingAttrs() };
  },
});
const HeadingSpacing = Heading.extend({
  addAttributes() {
    // NOTE: parent attrs (incl. heading `level`) must be spread — otherwise
    // every heading silently renders as <h1>.
    return { ...this.parent?.(), ...blockSpacingAttrs() };
  },
});

// Invisible spacer node that marks a page boundary. Its height is fitted per
// page (stored in the `h` attr, unscaled px) so following content lands exactly
// on the next sheet even when a page under-fills — fixed heights drift.
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      h: { default: 0 },
      // User-inserted manual break: never auto-removed, always kept as a
      // forced page boundary, persisted across save/load.
      user: { default: false },
    };
  },
  parseHTML() {
    return [{
      tag: 'div.page-break',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          h: parseFloat(el.style.height) || 0,
          user: el.dataset.userBreak === 'true',
        };
      },
    }];
  },
  renderHTML({ node }) {
    const h = typeof node.attrs.h === 'number' ? node.attrs.h : 0;
    const attrs: Record<string, string> = {
      class: 'page-break',
      'data-page-break': 'true',
      style: `height: ${h}px`,
    };
    if (node.attrs.user) attrs['data-user-break'] = 'true';
    return ['div', attrs];
  },
});

const GAP_MM = 12;
const PX_PER_MM = 96 / 25.4;

// Remove the visual-only AUTO page-break spacers before persisting/exporting.
// User-inserted breaks (data-user-break) are real content and are kept.
function stripPageBreaks(html: string): string {
  if (typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('.page-break:not([data-user-break="true"])').forEach((el) => el.remove());
  return div.innerHTML;
}

function stripCommentsForExport(html: string): string {
  if (typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('span[data-comment]').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  return div.innerHTML;
}

let spaceCanvas: HTMLCanvasElement | null = null;

/** Width of a space in the caret's own font (layout px), for Tab advances. */
function measureSpaceWidth(): number {
  try {
    if (!spaceCanvas && typeof document !== 'undefined') spaceCanvas = document.createElement('canvas');
    const ctx = spaceCanvas?.getContext('2d');
    // Resolve the caret element via the live DOM selection (view.nodeDOM can
    // return null for edge positions; the selection anchor is always present
    // when Tab is pressed in a focused editor).
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    const anchor = sel?.anchorNode;
    let el: HTMLElement | null = null;
    if (anchor instanceof HTMLElement) el = anchor;
    else {
      const p = (anchor as { parentElement?: unknown } | null)?.parentElement;
      if (p instanceof HTMLElement) el = p;
    }
    // NOTE: getComputedStyle().font (shorthand) serializes to "" in Chrome —
    // compose from longhands instead.
    const cs = el ? getComputedStyle(el) : null;
    const font = cs ? `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` : '';
    if (ctx) {
      if (font) ctx.font = font;
      const w = ctx.measureText(' ').width;
      if (w > 0) return w;
    }
  } catch {
    /* fall through to fallback */
  }
  return 4;
}

const extensions = [
  StarterKit.configure({ heading: false, paragraph: false }),
  ParagraphSpacing,
  HeadingSpacing.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        width: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('width') || (el as HTMLImageElement).style.width || null,
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.width ? { style: `width: ${attrs.width}` } : {},
        },
        align: {
          default: null,
          parseHTML: (el: HTMLElement) => el.dataset.align ?? null,
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.align ? { 'data-align': attrs.align as string } : {},
        },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(ResizableImageView);
    },
  }),
  TableKit.configure({ table: { resizable: true } }),
  TextStyleExt,
  FontFamily,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Underline,
  Link.configure({ openOnClick: false }),
  Subscript,
  Superscript,
  TaskList.configure({ itemTypeName: 'taskItem' }),
  TaskItem.configure({ nested: true }),
  CommentMark,
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
  const [hfDialogOpen, setHfDialogOpen] = useState(false);
  const [showRuler, setShowRuler] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('bdoc-ruler') !== 'false';
  });
  const [showStatusBar, setShowStatusBar] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('bdoc-statusbar') !== 'false';
  });
  const [findOpen, setFindOpen] = useState(false);
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number } | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [wordCount, setWordCount] = useState(0);
  const [zoom, setZoom] = useState<number>(() => {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(ZOOM_STORAGE_KEY) : null;
    const v = raw ? parseFloat(raw) : 1;
    return ZOOM_PRESETS.includes(v) ? v : 1;
  });
  const zoomRef = useRef<number>(1);
  const breaksRef = useRef<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastPaginateDispatchRef = useRef<number>(0);

  // Real pagination: insert/remove invisible page-break spacers so content breaks
  // onto the next sheet (with margins + gap) instead of spilling into the gaps.
  // Static print snapshot: an inert per-page clone (header + segments + footer)
  // used ONLY for print, where it paginates natively page by page.
  const rebuildPrintSnapshot = useCallback(() => {
    const editor = editorRef.current;
    const host = printRef.current;
    if (!editor || !host || typeof window === 'undefined') return;
    const wdoc = window.document;
    const hf = resolveHeaderFooter(pageSettingsRef.current);
    const kids = Array.from((editor.view.dom as HTMLElement).children) as HTMLElement[];
    const total = kids.filter((k) => k.classList.contains('page-break')).length + 1;
    host.innerHTML = '';
    const frag = wdoc.createDocumentFragment();
    let pg = 1;
    const appendFooter = (pageDiv: HTMLDivElement, p: number) => {
      const fText = headerFooterTextForPage(hf, 'footer', p);
      if (fText) {
        const f = wdoc.createElement('div');
        f.className = 'bdoc-print-hf';
        f.textContent = fText;
        pageDiv.appendChild(f);
      }
      if (hf.pageNumbersEnabled) {
        const pn = wdoc.createElement('div');
        pn.className = 'bdoc-print-hf';
        pn.style.textAlign = hf.pageNumberAlign;
        pn.textContent = `Page ${p} of ${total}`;
        pageDiv.appendChild(pn);
      }
    };
    let pageDiv = wdoc.createElement('div');
    pageDiv.className = 'bdoc-print-page';
    const hFirst = headerFooterTextForPage(hf, 'header', pg);
    if (hFirst) {
      const h = wdoc.createElement('div');
      h.className = 'bdoc-print-hf';
      h.textContent = hFirst;
      pageDiv.appendChild(h);
    }
    frag.appendChild(pageDiv);
    for (const k of kids) {
      if (k.classList.contains('page-break')) {
        appendFooter(pageDiv, pg);
        pg++;
        pageDiv = wdoc.createElement('div');
        pageDiv.className = 'bdoc-print-page';
        const hText = headerFooterTextForPage(hf, 'header', pg);
        if (hText) {
          const h = wdoc.createElement('div');
          h.className = 'bdoc-print-hf';
          h.textContent = hText;
          pageDiv.appendChild(h);
        }
        frag.appendChild(pageDiv);
      } else {
        pageDiv.appendChild(k.cloneNode(true));
      }
    }
    appendFooter(pageDiv, pg);
    host.appendChild(frag);
  }, []);

  const paginate = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const view = editor.view;
    const pm = view.dom as HTMLElement;
    const s = pageSettingsRef.current;
    const dims = PAGE_DIMENSIONS_MM[s.size];
    const pageH = s.orientation === 'landscape' ? dims.w : dims.h;
    const pageM = resolveMarginMm(s);
    const innerPx = Math.max(1, (pageH - 2 * pageM) * PX_PER_MM);
    const domChildren = Array.from(pm.children) as HTMLElement[];
    const { doc, schema } = editor.state;
    if (domChildren.length !== doc.childCount) {
      window.setTimeout(() => paginate(), 60);
      return;
    }

    // Measure every content block, then compute the ideal page breaks with a
    // greedy packer. Heights are flow ADVANCES (margin-collapse-correct:
    // adjoining vertical margins collapse to their max, not sum — naive
    // rect+margins over-estimates around headings/tables and lands breaks
    // early). Packing only decides break positions; exact sheet alignment is
    // enforced by per-spacer fitted heights below, so packing just needs to
    // avoid overflow. Re-running after insertion yields identical results —
    // no oscillation / runaway page creation.
    const z = zoomRef.current || 1;
    const rects: { h: number; mt: number; mb: number }[] = [];
    const kinds: string[] = [];
    for (let i = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      if (node.type.name === 'pageBreak') continue; // spacer, not content
      const el = domChildren[i];
      let h = 0;
      let mt = 0;
      let mb = 0;
      if (el) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        // getBoundingClientRect is in scaled (visual) px — convert back to
        // unscaled layout px so breaks stay correct at any zoom level.
        h = r.height / z;
        mt = parseFloat(cs.marginTop || '0');
        mb = parseFloat(cs.marginBottom || '0');
      }
      rects.push({ h, mt, mb });
      kinds.push(node.type.name);
    }
    // Advance from block i's top to block i+1's top. The last block is
    // approximated (rect + margin) — nothing below it can misalign.
    const heights: number[] = rects.map((r, i) => {
      const nextMt = i + 1 < rects.length ? rects[i + 1].mt : 0;
      return r.h + Math.max(r.mb, nextMt);
    });
    if (rects.length > 0) heights[0] += Math.max(0, rects[0].mt);
    const unitPx = (pageH + GAP_MM) * PX_PER_MM;
    const baseSpacerPx = (2 * pageM + GAP_MM) * PX_PER_MM;
    // User-inserted breaks are forced boundaries (content index before which
    // the user break sits). Always kept; packing resets after them.
    const forced = new Set<number>();
    {
      let fj = 0;
      for (let i = 0; i < doc.childCount; i++) {
        const node = doc.child(i);
        if (node.type.name === 'pageBreak') {
          if (node.attrs.user) forced.add(fj);
          continue;
        }
        fj++;
      }
    }
    const desiredBreaks = new Set<number>();
    // Estimated spacer height per break: exact when the page sum is exact
    // (unitPx - pageSum); falls back to the fixed spacer on overflow pages.
    const desiredHeights = new Map<number, number>();
    let used = 0;
    let pageStart = 0;
    for (let i = 0; i < heights.length; i++) {
      if (forced.has(i) && i > 0) {
        desiredBreaks.add(i);
        desiredHeights.set(i, used > innerPx ? baseSpacerPx : unitPx - used);
        used = 0;
        pageStart = i;
        used += heights[i];
        continue;
      }
      if (i > 0 && used + heights[i] > innerPx) {
        let b = i;
        // Keep-with-next: never strand a heading (or a run of headings) alone
        // at the bottom of a page — pull it onto the next page. But never
        // empty the current page: if it holds only headings, carry them over.
        if (kinds[i - 1] === 'heading') {
          b = i - 1;
          while (b > pageStart && kinds[b - 1] === 'heading') b--;
          if (b === pageStart) b = -1;
        }
        if (b > 0) {
          desiredBreaks.add(b);
          let nu = 0;
          for (let k = b; k < i; k++) nu += heights[k];
          const closedSum = used - nu;
          desiredHeights.set(b, closedSum > innerPx ? baseSpacerPx : unitPx - closedSum);
          used = nu;
          pageStart = b;
        }
        // b <= 0: carry the content over (overflow) rather than emit a bad break.
      }
      used += heights[i];
    }
    // Mirror the computed breaks for caret→page mapping (ref: no re-render).
    breaksRef.current = Array.from(desiredBreaks).sort((a, b) => a - b);
    // Single source of truth: the sheet count ALWAYS mirrors the computed
    // breaks — even on no-op passes. Without this, navigating from a long
    // document to an empty one keeps the stale page count (both break sets
    // are empty, so the idempotent check below returns early without ever
    // resetting). Functional compare → no render loop.
    setPageCount((prev) => {
      const next = desiredBreaks.size + 1;
      return prev === next ? prev : next;
    });

    // Current breaks: content indices + fitted spacer heights.
    const currentBreaks = new Map<number, number>();
    let cj = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      if (node.type.name === 'pageBreak') {
        const h = typeof node.attrs.h === 'number' ? (node.attrs.h as number) : baseSpacerPx;
        currentBreaks.set(cj, h);
        continue;
      }
      cj++;
    }
    const sameIndices =
      currentBreaks.size === desiredBreaks.size && [...desiredBreaks].every((c) => currentBreaks.has(c));

    // Guard: skip pagination dispatch if user is composing (IME) or if we dispatched
    // too recently (prevents rapid re-dispatch loops that can interfere with typing).
    const now = Date.now();
    if (isComposingRef.current) return;
    if (now - lastPaginateDispatchRef.current < 500) {
      window.setTimeout(() => paginate(), 500);
      return;
    }

    // Pre-pass: split tables taller than a full page at a row boundary so the
    // pieces can paginate normally. All splits go in one transaction (highest
    // position first), then return — the resulting update re-triggers paginate
    // for the regular break pass. Each split strictly shrinks the tallest
    // piece, so this terminates; pieces that fit are never re-split.
    {
      const splits: { pos: number; end: number; nodes: PMNode[] }[] = [];
      let spos = 0;
      let sci = 0;
      for (let i = 0; i < doc.childCount; i++) {
        const node = doc.child(i);
        const start = spos;
        spos += node.nodeSize;
        if (node.type.name === 'pageBreak') continue;
        const ci = sci++;
        if (node.type.name !== 'table' || heights[ci] <= innerPx || node.childCount < 2) continue;
        const el = domChildren[i];
        if (!el) continue;
        // TipTap wraps tables in a div.tableWrapper — descend to the <table>.
        const tableEl = el.tagName === 'TABLE' ? el : el.querySelector('table');
        if (!tableEl) continue;
        const rowEls = tableEl.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr');
        if (rowEls.length !== node.childCount) continue; // unexpected DOM (nested tables?) — stay safe
        const rowHs: number[] = [];
        let rowSum = 0;
        rowEls.forEach((re) => {
          const rh = (re as HTMLElement).getBoundingClientRect().height / (zoomRef.current || 1);
          rowHs.push(rh);
          rowSum += rh;
        });
        const chrome = Math.max(0, heights[ci] - rowSum); // borders/padding around rows
        let cut = -1;
        let acc = 0;
        for (let r = 0; r < rowHs.length - 1; r++) {
          acc += rowHs[r];
          if (acc + chrome <= innerPx) cut = r;
          else break;
        }
        if (cut < 0) continue; // even the first row overflows — cannot split meaningfully
        const rows1: PMNode[] = [];
        const rows2: PMNode[] = [];
        for (let r = 0; r < node.childCount; r++) {
          (r <= cut ? rows1 : rows2).push(node.child(r));
        }
        const t1 = schema.nodes.table.create(node.attrs, rows1);
        const t2 = schema.nodes.table.create(node.attrs, rows2);
        splits.push({ pos: start, end: start + node.nodeSize, nodes: [t1, schema.nodes.pageBreak.create({ h: baseSpacerPx }), t2] });
      }
      if (splits.length > 0) {
        let str = editor.state.tr;
        for (const s of splits.sort((a, b) => b.pos - a.pos)) {
          str = str.replaceWith(s.pos, s.end, s.nodes);
        }
        if (str.docChanged) {
          lastPaginateDispatchRef.current = Date.now();
          editor.view.dispatch(str);
          rebuildPrintSnapshot();
        }
        return;
      }
    }
    // Exact spacer fitting: measure what each spacer's height MUST be so the
    // following content lands exactly on the next sheet top. Feed-forward
    // (spacer heights never affect widths or anything above), top-down single
    // pass that folds in decided corrections — exact in one dispatch, and it
    // can never accumulate drift. Pure function of (doc state, live DOM).
    const measureFitted = (
      stateDoc: typeof doc,
      kids: HTMLElement[],
    ): Map<number, { pos: number; cur: number; need: number; attrs: Record<string, unknown> }> => {
      const out = new Map<number, { pos: number; cur: number; need: number; attrs: Record<string, unknown> }>();
      if (kids.length !== stateDoc.childCount) return out;
      const pm2 = editor.view.dom as HTMLElement;
      const z2 = zoomRef.current || 1;
      const pmTop = pm2.getBoundingClientRect().top;
      let sk = -1;
      let prevBottom: number | null = null;
      let prevMb = 0;
      let aboveCorr = 0; // Σ(new-old) of spacers already decided above
      let cj2 = 0;
      let pp = 0;
      kids.forEach((el, i) => {
        const node = stateDoc.child(i);
        const start = pp;
        pp += node.nodeSize;
        if (node.type.name === 'pageBreak') {
          sk++;
          if (prevBottom !== null) {
            const hAttr = node.attrs.h;
            const cur = typeof hAttr === 'number' ? hAttr : baseSpacerPx;
            // Target: next sheet's content top, rel pm top (pads cancel).
            // prevBottom measured in current layout; aboveCorr folds in the
            // shifts our own decided corrections will cause below.
            const need = Math.max(1, (sk + 1) * unitPx - (prevBottom + prevMb) - aboveCorr);
            out.set(cj2, { pos: start, cur, need, attrs: { ...node.attrs } });
            aboveCorr += need - cur;
          }
          return;
        }
        const r = el.getBoundingClientRect();
        prevBottom = (r.bottom - pmTop) / z2;
        prevMb = parseFloat(getComputedStyle(el).marginBottom || '0');
        cj2++;
      });
      return out;
    };

    const fitted = measureFitted(doc, domChildren);
    const FIT_TOL = 1; // steady-state tolerance: below this, consider aligned
    const sameHeights =
      fitted.size === currentBreaks.size &&
      [...currentBreaks.keys()].every(
        (c) => fitted.has(c) && Math.abs((fitted.get(c)?.need ?? 0) - (currentBreaks.get(c) ?? 0)) <= FIT_TOL,
      );
    if (sameIndices && sameHeights) return;

    const dispatchHeights = (entries: { pos: number; h: number; attrs: Record<string, unknown> }[]) => {
      if (entries.length === 0) return false;
      const trx = editor.state.tr;
      trx.setMeta('addToHistory', false);
      for (const e of entries.sort((a, b) => b.pos - a.pos)) {
        // Merge: setNodeMarkup REPLACES the whole attrs object, so re-apply
        // existing attrs (e.g. user:true) or height fitting would silently
        // convert user breaks into auto ones (deleted on the next pass).
        trx.setNodeMarkup(e.pos, undefined, { ...e.attrs, h: e.h });
      }
      if (!trx.docChanged) return false;
      lastPaginateDispatchRef.current = Date.now();
      editor.view.dispatch(trx);
      rebuildPrintSnapshot();
      return true;
    };

    if (!sameIndices) {
      // Structural change: rebuild all breaks (history), then fit exactly.
      // Remove all AUTO page breaks (last to first so positions stay valid).
      // User-inserted breaks are real content — never auto-removed (a leading
      // user break the packer can't place is left alone, harmlessly).
      // Top-level doc content is indexed from 0 (the doc's own tokens are not
      // counted), so the first child starts at position 0.
      let tr = editor.state.tr;
      let pos = 0;
      const delPos: number[] = [];
      for (let i = 0; i < doc.childCount; i++) {
        const before = pos;
        const node = doc.child(i);
        if (node.type.name === 'pageBreak' && !node.attrs.user) delPos.push(before);
        pos += node.nodeSize;
      }
      for (let k = delPos.length - 1; k >= 0; k--) {
        tr = tr.delete(delPos[k], delPos[k] + 1);
      }

      // Position before each content node in the post-deletion doc (auto breaks
      // removed, user breaks kept — surviving user breaks keep their footprint
      // in the running position). Inserts go highest position first, seeded
      // with estimated heights (corrected exactly right after dispatch).
      let running = 0;
      const posBeforeContent: Record<number, number> = {};
      let ck = 0;
      for (let i = 0; i < doc.childCount; i++) {
        const node = doc.child(i);
        if (node.type.name === 'pageBreak') {
          if (node.attrs.user) running += node.nodeSize;
          continue;
        }
        posBeforeContent[ck] = running;
        running += node.nodeSize;
        ck++;
      }
      const desired = Array.from(desiredBreaks).sort((a, b) => b - a);
      for (const c of desired) {
        const p = posBeforeContent[c];
        if (typeof p === 'number') {
          tr = tr.insert(p, schema.nodes.pageBreak.create({ h: desiredHeights.get(c) ?? baseSpacerPx, user: forced.has(c) }));
        }
      }
      if (tr.docChanged) {
        lastPaginateDispatchRef.current = Date.now();
        editor.view.dispatch(tr);
        rebuildPrintSnapshot();
        // Immediately fit exactly (fresh DOM is synchronous post-dispatch).
        const fresh = editor.state;
        const freshKids = Array.from((editor.view.dom as HTMLElement).children) as HTMLElement[];
        const refit = [...measureFitted(fresh.doc, freshKids).values()]
          .filter((f) => Math.abs(f.need - f.cur) > 0.75)
          .map((f) => ({ pos: f.pos, h: f.need, attrs: f.attrs }));
        dispatchHeights(refit);
      }
      return;
    }

    // Breaks unchanged — nudge stale spacer heights only (no history entry).
    const tweaks = [...fitted.entries()]
      .filter(([c, f]) => Math.abs(f.need - (currentBreaks.get(c) ?? f.cur)) > 0.75)
      .map(([, f]) => ({ pos: f.pos, h: f.need, attrs: f.attrs }));
    dispatchHeights(tweaks);
  }, [setPageCount, rebuildPrintSnapshot]);

  const paginateTimer = useRef<number | null>(null);
  const schedulePaginate = useCallback(() => {
    if (paginateTimer.current) window.clearTimeout(paginateTimer.current);
    paginateTimer.current = window.setTimeout(() => paginate(), 120);
  }, [paginate]);

  // Keep the zoom ref in sync and persist the preference; re-measure after
  // the scaled layout has painted.
  useEffect(() => {
    zoomRef.current = zoom;
    try {
      window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
    } catch {
      /* storage unavailable — zoom still works for the session */
    }
  }, [zoom]);

  const handleZoomChange = useCallback((next: number) => {
    if (!ZOOM_PRESETS.includes(next)) return;
    setZoom(next);
    window.setTimeout(schedulePaginate, 150);
    window.setTimeout(schedulePaginate, 450);
  }, [schedulePaginate]);

  // Map the caret to its page: content index of the top-level node holding
  // the selection head, then count breaks at or before it.
  const updateCaretPage = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const { $head } = editor.state.selection;
      const { doc } = editor.state;
      const topIdx = Math.min($head.index(0), doc.childCount);
      let ci = 0;
      for (let i = 0; i < topIdx; i++) {
        if (doc.child(i).type.name !== 'pageBreak') ci++;
      }
      let pg = 1;
      for (const b of breaksRef.current) {
        if (b <= ci) pg++;
        else break;
      }
      setCurrentPage((prev) => (prev === pg ? prev : pg));
    } catch {
      /* transient selection state during doc swaps — ignore */
    }
  }, []);

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    immediatelyRender: false,
    editorProps: {
      // Native spell checking (OS/browser dictionaries) — the Word-style red squiggles.
      // Tab advances the caret to the next tab stop of the current block by
      // inserting spaces (industry-standard web-editor behavior); exact stop
      // rendering is honored on Word export. Inside tables, Tab keeps its
      // native cell navigation.
      handleKeyDown: (view, event) => {
        if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
          return false;
        }
        const { $head } = view.state.selection;
        for (let d = 1; d <= $head.depth; d++) {
          const t = $head.node(d).type.name;
          if (t === 'table' || t === 'tableRow' || t === 'tableCell' || t === 'tableHeader') return false;
        }
        try {
          const parent = $head.parent;
          const raw = parent.attrs.tabStops;
          const stops: number[] = (
            Array.isArray(raw) ? raw.filter((n) => typeof n === 'number') : []
          ).sort((a, b) => a - b);
          const coords = view.coordsAtPos($head.pos);
          const pmRect = (view.dom as HTMLElement).getBoundingClientRect();
          const z = zoomRef.current || 1;
          const caretMm = (coords.left - pmRect.left) / z / PX_PER_MM;
          const next = stops.find((s) => s > caretMm + 0.5);
          let spaces: number;
          if (next !== undefined) {
            const gapPx = (next - caretMm) * PX_PER_MM;
            spaces = Math.max(1, Math.round(gapPx / measureSpaceWidth()));
          } else {
            spaces = 4;
          }
          view.dispatch(view.state.tr.insertText(' '.repeat(spaces)));
          return true;
        } catch {
          return false;
        }
      },
      // Clicks landing in an inter-page gap (the tall invisible spacer) snap
      // to the NEAREST text edge — end of the previous block when clicking
      // the upper area, start of the next block for the lower area — instead
      // of ProseMirror's default which always jumps across the break.
      handleClick: (view, _pos, event) => {
        if (!(event instanceof MouseEvent) || event.button !== 0) return false;
        const pm = view.dom as HTMLElement;
        const brs = Array.from(pm.querySelectorAll('.page-break')) as HTMLElement[];
        // Match the whole inter-block span (prev bottom → next top), which
        // includes the adjoining margins — a click 8px below a paragraph is
        // still inside its margin zone, not the spacer div itself.
        let hit: HTMLElement | null = null;
        let dPrev = Infinity;
        let dNext = Infinity;
        for (const b of brs) {
          const r = b.getBoundingClientRect();
          if (event.clientX < r.left || event.clientX > r.right) continue;
          const prev = b.previousElementSibling;
          const next = b.nextElementSibling;
          if (!(prev instanceof HTMLElement) || !(next instanceof HTMLElement)) continue;
          const top = prev.getBoundingClientRect().bottom;
          const bottom = next.getBoundingClientRect().top;
          if (event.clientY >= top && event.clientY <= bottom) {
            hit = b;
            dPrev = event.clientY - top;
            dNext = bottom - event.clientY;
            break;
          }
        }
        if (!hit) return false;
        const kids = Array.from(pm.children);
        const di = kids.indexOf(hit);
        if (di < 0 || view.state.doc.child(di).type.name !== 'pageBreak') return false;
        let p = 0;
        for (let i = 0; i < di; i++) p += view.state.doc.child(i).nodeSize;
        const dir = dPrev <= dNext ? -1 : 1;
        try {
          const sel = Selection.findFrom(view.state.doc.resolve(p), dir);
          if (!sel) return false;
          view.dispatch(view.state.tr.setSelection(sel));
          return true;
        } catch {
          return false;
        }
      },
    },
    onUpdate: ({ editor: ed }) => {
      setSaveStatus('dirty');
      scheduleSave();
      schedulePaginate();
      updateCaretPage();
      const text = ed.getText().trim();
      const next = text ? text.split(/\s+/).length : 0;
      setWordCount((prev) => (prev === next ? prev : next));
    },
    onSelectionUpdate: () => {
      updateCaretPage();
    },
  });
  editorRef.current = editor;

  // Track IME composition to avoid paginating during active composition
  useEffect(() => {
    if (!editor) return;
    // Native spellcheck (Word-style red squiggles via OS/browser dictionaries).
    editor.view.dom.setAttribute('spellcheck', 'true');
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

  // Right-click inside a table opens the table context menu (Docs-style);
  // elsewhere the native menu is left alone.
  useEffect(() => {
    if (!editor) return;
    const pm = editor.view.dom as HTMLElement;
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.closest !== 'function' || !t.closest('table')) return;
      e.preventDefault();
      setTableMenu({ x: e.clientX, y: e.clientY });
    };
    pm.addEventListener('contextmenu', onCtx);
    return () => pm.removeEventListener('contextmenu', onCtx);
  }, [editor]);

  // Refresh the static print snapshot before printing.
  useEffect(() => {
    const onBeforePrint = () => rebuildPrintSnapshot();
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, [rebuildPrintSnapshot]);

  // Clicks landing in empty page areas (margins, padding, blank space below
  // content) hit the .bdoc-page stack container, never ProseMirror — without
  // this, the caret silently refuses to move there. Map the click to the
  // nearest text position (Word-style single click) and support drag-select
  // from empty space. Clicks inside .ProseMirror are left to ProseMirror
  // (text, gap snapping) and header/footer zones keep their own handlers.
  // NOTE: depends on loading + document id too — the stack subtree mounts
  // only after load and remounts on every document switch; without this the
  // listener stays attached to a detached node forever.
  useEffect(() => {
    if (!editor || loading) return;
    const stack = (editor.view.dom as HTMLElement).closest('.bdoc-page') as HTMLElement | null;
    if (!stack) return;
    const placeAt = (clientX: number, clientY: number): number | null => {
      // posAtCoords returns null outside the editor root's box, so clamp
      // into it first — the clamped point maps to the nearest text.
      const pm = editor.view.dom as HTMLElement;
      const r = pm.getBoundingClientRect();
      const x = Math.min(Math.max(clientX, r.left), Math.max(r.left, r.right - 1));
      const y = Math.min(Math.max(clientY, r.top), Math.max(r.top, r.bottom - 1));
      const found = editor.view.posAtCoords({ left: x, top: y });
      if (!found) return null;
      try {
        const sel = Selection.near(editor.state.doc.resolve(found.pos));
        editor.view.dispatch(editor.state.tr.setSelection(sel));
        editor.view.focus();
        return sel.$head.pos;
      } catch {
        return null;
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === 'function' && t.closest('.ProseMirror')) return;
      e.preventDefault();
      const anchor = placeAt(e.clientX, e.clientY);
      if (anchor === null) return;
      const anchorPos = anchor;
      const onMove = (me: MouseEvent) => {
        try {
          const found = editor.view.posAtCoords({ left: me.clientX, top: me.clientY });
          if (!found) return;
          const head = Selection.near(editor.state.doc.resolve(found.pos)).$head.pos;
          editor.view.dispatch(
            editor.state.tr.setSelection(TextSelection.create(editor.state.doc, anchorPos, head)),
          );
        } catch {
          /* ignore transient positions */
        }
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp, { once: true });
    };
    stack.addEventListener('mousedown', onMouseDown);
    return () => stack.removeEventListener('mousedown', onMouseDown);
  }, [editor, loading, document?.id]);

  const [activeComment, setActiveComment] = useState<{
    id: string;
    text: string;
    author: string;
    resolved: boolean;
    rect: DOMRect;
  } | null>(null);

  const findCommentRange = useCallback(
    (id: string): { from: number; to: number } | null => {
      if (!editor) return null;
      let from = -1;
      let to = -1;
      editor.state.doc.descendants((node, pos) => {
        if (from !== -1) return false;
        const mark = node.marks.find((m) => m.type.name === 'comment' && (m.attrs as { id: string }).id === id);
        if (mark) {
          from = pos;
          let end = pos + node.nodeSize;
          editor.state.doc.nodesBetween(pos, editor.state.doc.content.size, (n, p) => {
            if (p < pos) return true;
            if (p > end) return false;
            const mm = n.marks.find((m) => m.type.name === 'comment' && (m.attrs as { id: string }).id === id);
            if (mm && n.isText) end = p + n.nodeSize;
            return true;
          });
          to = end;
          return false;
        }
        return true;
      });
      return from !== -1 ? { from, to } : null;
    },
    [editor],
  );

  const resolveComment = useCallback(
    (id: string) => {
      const range = findCommentRange(id);
      if (!range || !editor) return;
      const tr = editor.state.tr;
      // Preserve other attrs but flip resolved
      const markType = editor.state.schema.marks.comment;
      const existing = editor.state.doc.resolve(range.from + 1).marks().find((m) => m.type.name === 'comment' && (m.attrs as { id: string }).id === id);
      const attrs = { ...(existing?.attrs ?? {}), resolved: true };
      tr.removeMark(range.from, range.to, markType);
      tr.addMark(range.from, range.to, markType.create(attrs));
      editor.view.dispatch(tr);
      setActiveComment(null);
    },
    [editor, findCommentRange],
  );

  const deleteComment = useCallback(
    (id: string) => {
      const range = findCommentRange(id);
      if (!range || !editor) return;
      editor.view.dispatch(editor.state.tr.removeMark(range.from, range.to, editor.state.schema.marks.comment));
      setActiveComment(null);
    },
    [editor, findCommentRange],
  );

  // Comment click: show anchored card with quote + author, Resolve / Delete.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onClick = (e: MouseEvent) => {
      const span = (e.target as HTMLElement).closest('span[data-comment]') as HTMLElement | null;
      if (!span) {
        setActiveComment(null);
        return;
      }
      const text = span.getAttribute('data-comment-text') || '';
      const id = span.getAttribute('data-comment-id');
      if (!id) return;
      const author = span.getAttribute('data-comment-author') || 'You';
      const resolved = span.getAttribute('data-comment-resolved') === 'true';
      setActiveComment({ id, text, author, resolved, rect: span.getBoundingClientRect() });
    };
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [editor]);

  // Re-paginate when async resources settle: fonts, full page load, and
  // images change block heights without firing any editor transaction.
  useEffect(() => {
    let cancelled = false;
    const kick = () => {
      if (!cancelled) schedulePaginate();
    };
    try {
      const wdoc = window.document as unknown as { fonts?: { ready?: Promise<unknown> } };
      wdoc.fonts?.ready?.then(kick).catch(() => undefined);
    } catch {
      /* font API unavailable — ignore */
    }
    window.addEventListener('load', kick);
    return () => {
      cancelled = true;
      window.removeEventListener('load', kick);
    };
  }, [schedulePaginate]);

  // Watch for late-loading images inside the editor and re-paginate once
  // each finishes (their heights change the page flow).
  useEffect(() => {
    if (!editor) return;
    const pm = editor.view.dom as HTMLElement;
    const attach = (img: HTMLImageElement) => {
      if (img.complete) return;
      img.addEventListener('load', schedulePaginate, { once: true });
    };
    pm.querySelectorAll('img').forEach(attach);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLImageElement) attach(n);
          else if (n instanceof HTMLElement) n.querySelectorAll('img').forEach(attach);
        });
      }
    });
    mo.observe(pm, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [editor, schedulePaginate]);

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
    // Fresh document → fresh pagination state immediately (before content
    // loads and paginate runs). Otherwise a stale page count from the
    // previously open document lingers on empty/new documents.
    setPageCount(1);
    setCurrentPage(1);
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
      rebuildPrintSnapshot();
    } catch {
      setSaveStatus('dirty');
    } finally {
      saveInFlight.current = false;
      if (pending.current) {
        pending.current = false;
        save();
      }
    }
  }, [editor, rebuildPrintSnapshot]);

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
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setFindOpen(true);
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

  // Single click on a header/footer zone moves the caret into the adjacent
  // body text (double-click opens the header/footer dialog instead).
  const placeCaretNearZone = useCallback((e: React.MouseEvent, kind: 'header' | 'footer') => {
    const ed = editorRef.current;
    if (!ed) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = kind === 'header' ? r.bottom + 4 : r.top - 4;
    const found = ed.view.posAtCoords({ left: e.clientX, top: y });
    if (!found) return;
    try {
      const sel = Selection.near(ed.state.doc.resolve(found.pos));
      ed.view.dispatch(ed.state.tr.setSelection(sel));
      ed.view.focus();
    } catch {
      /* ignore */
    }
  }, []);

  const handleHeaderFooterChange = (hf: HeaderFooterSettings) => {
    handlePageSettingsChange({ ...pageSettingsRef.current, headerFooter: hf });
  };

  // Ruler drag → uniform custom margin (skip no-ops to avoid render churn).
  const handleMarginChange = useCallback((mm: number) => {
    const cur = pageSettingsRef.current;
    if (cur.margins === 'custom' && cur.customMarginMm === mm) return;
    if (cur.margins !== 'custom' && resolveMarginMm(cur) === mm) return;
    handlePageSettingsChange({ ...cur, margins: 'custom', customMarginMm: mm });
  }, [handlePageSettingsChange]);

  const handleToggleRuler = useCallback(() => {
    setShowRuler((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('bdoc-ruler', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const handleToggleStatusBar = useCallback(() => {
    setShowStatusBar((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('bdoc-statusbar', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Dynamic @page rule so print/PDF matches the on-screen page setup.
  // A2/A1 have no CSS size keywords — fall back to explicit millimetres.
  useEffect(() => {
    const landscape = pageSettings.orientation === 'landscape';
    const dim = PAGE_DIMENSIONS_MM[pageSettings.size];
    const w = landscape ? dim.h : dim.w;
    const h = landscape ? dim.w : dim.h;
    const size =
      pageSettings.size === 'A5' || pageSettings.size === 'A4' || pageSettings.size === 'A3'
        ? `${pageSettings.size} ${landscape ? 'landscape' : 'portrait'}`
        : `${w}mm ${h}mm`;
    const css = `@page { size: ${size}; margin: ${resolveMarginMm(pageSettings)}mm; }`;
    let el = window.document.getElementById('bdoc-print-page');
    if (!el) {
      el = window.document.createElement('style');
      el.id = 'bdoc-print-page';
      window.document.head.appendChild(el);
    }
    el.textContent = css;
    return () => {
      window.document.getElementById('bdoc-print-page')?.remove();
    };
  }, [pageSettings]);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    if (file.size > 5 * 1024 * 1024) {
      window.alert('Image too large — please pick a file under 5 MB (try compressing it).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  };

  // Drag-drop images directly onto the page (files → base64, same guard).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      }
    };
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      e.preventDefault();
      if (file.size > 5 * 1024 * 1024) {
        window.alert('Image too large — please pick a file under 5 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        editor.chain().focus().setImage({ src: reader.result as string }).run();
      };
      reader.readAsDataURL(file);
    };
    dom.addEventListener('dragover', onDragOver);
    dom.addEventListener('drop', onDrop);
    return () => {
      dom.removeEventListener('dragover', onDragOver);
      dom.removeEventListener('drop', onDrop);
    };
  }, [editor]);

  const handleInsertToc = () => {
    if (!editor) return;
    const entries: { level: number; text: string }[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'heading' && node.textContent.trim()) {
        entries.push({ level: node.attrs.level as number, text: node.textContent.slice(0, 80) });
      }
    });
    if (entries.length === 0) {
      editor.chain().focus().insertContent('<p><em>Table of Contents — No headings found.</em></p>').run();
      return;
    }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = '<div data-toc="true" style="border:1px solid var(--border);padding:12px;border-radius:8px;background:var(--surface-2);margin:12px 0;"><p><strong>Table of Contents</strong></p><ul>';
    entries.forEach((e) => {
      const indent = (e.level - 1) * 16;
      html += `<li style="margin-left:${indent}px">${esc(e.text)}</li>`;
    });
    html += '</ul></div>';
    editor.chain().focus().insertContent(html).run();
  };

  const handleAddComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      window.alert('Select text to comment on.');
      return;
    }
    const text = window.prompt('Comment:');
    if (text === null || text.trim() === '') return;
    const id = crypto.randomUUID();
    editor.chain().focus().setMark('comment', { id, text: text.trim(), author: 'You', resolved: false }).run();
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const { html, settings } = await importDocumentFromDocx(file);
      const name = file.name.replace(/\.docx$/i, '') || 'Imported document';
      const doc = await create(name);
      await updateDocument({
        ...doc,
        title: name,
        content: html || '<p></p>',
        settings: settings ?? doc.settings,
      });
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
        content: stripCommentsForExport(stripPageBreaks(fresh.content || '')),
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
  const hf = resolveHeaderFooter(pageSettings);
  const dims = PAGE_DIMENSIONS_MM[pageSettings.size];
  const pageW = pageSettings.orientation === 'landscape' ? dims.h : dims.w;
  const pageH = pageSettings.orientation === 'landscape' ? dims.w : dims.h;
  const pageM = resolveMarginMm(pageSettings);
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
      zoom={zoom}
      onZoomChange={handleZoomChange}
      onEditHeaderFooter={() => setHfDialogOpen(true)}
      showRuler={showRuler}
      onToggleRuler={handleToggleRuler}
      showStatusBar={showStatusBar}
      onToggleStatusBar={handleToggleStatusBar}
      onFindReplace={() => setFindOpen(true)}
      onWordCount={() => setWordCountOpen(true)}
      onHelp={() => setHelpOpen(true)}
      onVersionHistory={() => setVersionHistoryOpen(true)}
      onAddComment={handleAddComment}
      onInsertToc={handleInsertToc}
      title={title}
      onTitleChange={handleTitleChange}
      titleStatus={
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${saveStatus === 'dirty' ? 'bg-amber-400' : saveStatus === 'saving' ? 'bg-accent' : saveStatus === 'saved' ? 'bg-success' : 'bg-ink-faint'}`} />
          {statusLabel}
        </span>
      }
      onImageUpload={() => imageInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleImport}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
      <div className="editor-workspace flex h-full min-h-full flex-col overflow-hidden">
        <div className="bdoc-scroll min-h-0 flex-1 overflow-auto pb-16">
        <div className="mx-auto flex flex-col items-stretch" style={{ width: `${pageW}mm` }}>
          {/* Toolbar */}
          <div className="sticky top-0 z-50 pt-2 pb-4 bg-gradient-to-b from-workspace via-workspace/95 to-transparent no-print">
            <div className="px-4">
              <Toolbar editor={editor} zoom={zoom} onZoomChange={handleZoomChange} onPrint={() => window.print()} onImageUpload={() => imageInputRef.current?.click()} />
            </div>
            {showRuler && (
              <Ruler editor={editor} pageWidthMm={pageW} marginMm={pageM} onMarginChange={handleMarginChange} />
            )}
          </div>
        </div>

          {/* Paginated document — zoom scales the sheet stack only */}
          {loading ? (
            <div className="mx-auto px-6 py-20 flex justify-center text-ink-muted" style={{ width: `${pageW}mm` }}>
              <span className="flex items-center gap-2">
                <FaSpinner className="animate-spin" /> Loading document…
              </span>
            </div>
          ) : loadError ? (
            <div className="mx-auto px-6 py-20 text-center text-danger" style={{ width: `${pageW}mm` }}>
              {loadError}
            </div>
          ) : (
            <div className="zoom-outer" style={{ width: `${pageW * zoom}mm`, height: `${stackHeightMm * zoom}mm`, margin: '0 auto' }}>
            <div className="zoom-inner relative" style={{ width: `${pageW}mm`, height: `${stackHeightMm}mm`, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              {Array.from({ length: pageCount }).map((_, i) => {
                const pg = i + 1;
                const hText = headerFooterTextForPage(hf, 'header', pg);
                const fText = headerFooterTextForPage(hf, 'footer', pg);
                return (
                  <Fragment key={i}>
                    <div
                      aria-hidden
                      className={`page-sheet absolute left-0 top-0 pointer-events-none${i === Math.min(currentPage, pageCount) - 1 ? ' page-sheet-active' : ''}`}
                      style={{
                        top: `${i * unitMm}mm`,
                        height: `${pageH}mm`,
                        width: `${pageW}mm`,
                        padding: `${pageM}mm`,
                      }}
                    />
                    {hText && (
                      <div
                        className="page-header-zone"
                        data-page={pg}
                        title="Double-click to edit header"
                        onClick={(e) => placeCaretNearZone(e, 'header')}
                        onDoubleClick={() => setHfDialogOpen(true)}
                        style={{
                          top: `${i * unitMm + pageM * 0.2}mm`,
                          left: `${pageM}mm`,
                          width: `${pageW - 2 * pageM}mm`,
                          height: `${pageM * 0.6}mm`,
                        }}
                      >
                        {hText}
                      </div>
                    )}
                    {(fText || hf.pageNumbersEnabled) && (
                      <div
                        className="page-footer-zone"
                        data-page={pg}
                        title="Double-click to edit footer"
                        onClick={(e) => placeCaretNearZone(e, 'footer')}
                        onDoubleClick={() => setHfDialogOpen(true)}
                        style={{
                          top: `${i * unitMm + pageH - pageM * 0.8}mm`,
                          left: `${pageM}mm`,
                          width: `${pageW - 2 * pageM}mm`,
                          height: `${pageM * 0.6}mm`,
                        }}
                      >
                        {fText && <div>{fText}</div>}
                        {hf.pageNumbersEnabled && (
                          <div style={{ textAlign: hf.pageNumberAlign }}>Page {pg} of {pageCount}</div>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
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
            {/* Static print snapshot (hidden on screen, paginates natively in print) */}
            <div ref={printRef} className="bdoc-print" aria-hidden />
            </div>
          )}
        </div>

        {/* Word-like status bar — pinned, always visible */}
        {showStatusBar && (
          <div className="editor-statusbar no-print z-40 flex shrink-0 items-center gap-4 px-5">
            <span>Page {Math.min(currentPage, pageCount)} of {pageCount}</span>
            <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
            <span className="ml-auto">Print Layout · {Math.round(zoom * 100)}%</span>
          </div>
        )}
      </div>
      {hfDialogOpen && (
        <HeaderFooterDialog
          settings={resolveHeaderFooter(pageSettingsRef.current)}
          onChange={handleHeaderFooterChange}
          onClose={() => setHfDialogOpen(false)}
        />
      )}
      {findOpen && editor && (
        <FindReplaceDialog editor={editor} onClose={() => setFindOpen(false)} />
      )}
      {wordCountOpen && editor && (
        <WordCountDialog editor={editor} pageCount={pageCount} onClose={() => setWordCountOpen(false)} />
      )}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {versionHistoryOpen && id && (
        <VersionHistoryDialog
          docId={id}
          onClose={() => setVersionHistoryOpen(false)}
          onRestored={async () => {
            try {
              const fresh = await getDocument(id);
              setDocument(fresh);
              setTitle(fresh.title || 'Untitled');
              const parsed = parsePageSettings(fresh.settings);
              setPageSettings(parsed);
              pageSettingsRef.current = parsed;
              editor?.commands.setContent(fresh.content || '<p></p>');
              window.setTimeout(schedulePaginate, 120);
            } catch {
              /* ignore */
            }
          }}
        />
      )}
      {tableMenu && editor && (
        <TableContextMenu
          editor={editor}
          x={tableMenu.x}
          y={tableMenu.y}
          onClose={() => setTableMenu(null)}
        />
      )}
      {activeComment && (
        <div
          className="fixed z-[250] w-72 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] p-3"
          style={{
            left: Math.min(window.innerWidth - 300, Math.max(12, activeComment.rect.left)),
            top: Math.min(window.innerHeight - 180, activeComment.rect.bottom + 8),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] uppercase tracking-widest text-ink-faint mb-1">
            {activeComment.author} — {activeComment.resolved ? 'Resolved' : 'Comment'}
          </div>
          <div className="text-sm text-ink mb-2 whitespace-pre-wrap break-words">{activeComment.text}</div>
          <div className="flex gap-2">
            {!activeComment.resolved && (
              <button
                type="button"
                onClick={() => resolveComment(activeComment.id)}
                className="flex-1 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
              >
                Resolve
              </button>
            )}
            {activeComment.resolved && (
              <button
                type="button"
                onClick={() => {
                  const range = findCommentRange(activeComment.id);
                  if (!range || !editor) return;
                  const markType = editor.state.schema.marks.comment;
                  const existing = editor.state.doc.resolve(range.from + 1).marks().find((m) => m.type.name === 'comment' && (m.attrs as { id: string }).id === activeComment.id);
                  const tr = editor.state.tr;
                  tr.removeMark(range.from, range.to, markType);
                  tr.addMark(range.from, range.to, markType.create({ ...(existing?.attrs ?? {}), resolved: false }));
                  editor.view.dispatch(tr);
                  setActiveComment(null);
                }}
                className="flex-1 py-1.5 rounded-lg text-sm bg-soft text-ink hover:bg-soft/80 transition-colors"
              >
                Unresolve
              </button>
            )}
            <button
              type="button"
              onClick={() => deleteComment(activeComment.id)}
              className="flex-1 py-1.5 rounded-lg text-sm bg-danger-soft text-danger hover:brightness-110 transition-colors"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setActiveComment(null)}
              className="px-3 py-1.5 rounded-lg text-sm bg-soft text-ink-muted hover:text-ink transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}