import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Node, Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Selection } from '@tiptap/pm/state';
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
import Ruler from '../components/Ruler';
import HeaderFooterDialog from '../components/HeaderFooterDialog';
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
    };
  },
  parseHTML() {
    return [{
      tag: 'div.page-break',
      getAttrs: (dom) => ({ h: parseFloat((dom as HTMLElement).style.height) || 0 }),
    }];
  },
  renderHTML({ node }) {
    const h = typeof node.attrs.h === 'number' ? node.attrs.h : 0;
    return ['div', { class: 'page-break', 'data-page-break': 'true', style: `height: ${h}px` }];
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
  const [hfDialogOpen, setHfDialogOpen] = useState(false);
  const [showRuler, setShowRuler] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('bdoc-ruler') !== 'false';
  });
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
    const desiredBreaks = new Set<number>();
    // Estimated spacer height per break: exact when the page sum is exact
    // (unitPx - pageSum); falls back to the fixed spacer on overflow pages.
    const desiredHeights = new Map<number, number>();
    let used = 0;
    let pageStart = 0;
    for (let i = 0; i < heights.length; i++) {
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
    // following content lands exactly on the next sheet top. Feed-forward —
    // spacer heights never affect widths, wrapping, or anything above them —
    // so this converges and can never accumulate drift: every page aligns
    // from live measurement regardless of upstream error. Top-down single
    // pass: corrections decided for spacers above are folded in, making the
    // whole stack exact in one dispatch (no ripple across passes).
    // Pure function of (doc state, live DOM children).
    const measureFitted = (
      stateDoc: typeof doc,
      kids: HTMLElement[],
    ): Map<number, { pos: number; cur: number; need: number }> => {
      const out = new Map<number, { pos: number; cur: number; need: number }>();
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
            out.set(cj2, { pos: start, cur, need });
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

    const dispatchHeights = (entries: { pos: number; h: number }[]) => {
      if (entries.length === 0) return false;
      const trx = editor.state.tr;
      trx.setMeta('addToHistory', false);
      for (const e of entries.sort((a, b) => b.pos - a.pos)) {
        trx.setNodeMarkup(e.pos, undefined, { h: e.h });
      }
      if (!trx.docChanged) return false;
      lastPaginateDispatchRef.current = Date.now();
      editor.view.dispatch(trx);
      rebuildPrintSnapshot();
      return true;
    };

    if (!sameIndices) {
      // Structural change: rebuild all breaks (history), then fit exactly.
      // The number of pages is exactly (breaks + 1); drive the sheet stack
      // from this instead of a scrollHeight measurement (off by one).
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

      // Position before each content node (in the now break-free doc), then
      // insert the desired breaks from highest position to lowest, seeded
      // with estimated heights (corrected exactly right after dispatch).
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
          tr = tr.insert(p, schema.nodes.pageBreak.create({ h: desiredHeights.get(c) ?? baseSpacerPx }));
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
          .map((f) => ({ pos: f.pos, h: f.need }));
        dispatchHeights(refit);
      }
      return;
    }

    // Breaks unchanged — nudge stale spacer heights only (no history entry).
    const tweaks = [...fitted.entries()]
      .filter(([c, f]) => Math.abs(f.need - (currentBreaks.get(c) ?? f.cur)) > 0.75)
      .map(([, f]) => ({ pos: f.pos, h: f.need }));
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

  // Refresh the static print snapshot before printing.
  useEffect(() => {
    const onBeforePrint = () => rebuildPrintSnapshot();
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, [rebuildPrintSnapshot]);

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
      title={title}
      onTitleChange={handleTitleChange}
      titleStatus={
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${saveStatus === 'dirty' ? 'bg-amber-400' : saveStatus === 'saving' ? 'bg-accent' : saveStatus === 'saved' ? 'bg-success' : 'bg-ink-faint'}`} />
          {statusLabel}
        </span>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleImport}
      />
      <div className="editor-workspace flex h-full min-h-full flex-col overflow-hidden">
        <div className="bdoc-scroll min-h-0 flex-1 overflow-auto pb-16">
        <div className="mx-auto flex flex-col items-stretch" style={{ width: `${pageW}mm` }}>
          {/* Toolbar */}
          <div className="sticky top-0 z-50 px-4 pt-2 pb-4 bg-gradient-to-b from-workspace via-workspace/95 to-transparent no-print">
            <Toolbar editor={editor} />
            {showRuler && (
              <Ruler pageWidthMm={pageW} marginMm={pageM} onMarginChange={handleMarginChange} />
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
        <div className="editor-statusbar no-print z-40 flex shrink-0 items-center gap-4 px-5">
          <span>Page {Math.min(currentPage, pageCount)} of {pageCount}</span>
          <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
          <span className="ml-auto">Print Layout · {Math.round(zoom * 100)}%</span>
        </div>
      </div>
      {hfDialogOpen && (
        <HeaderFooterDialog
          settings={resolveHeaderFooter(pageSettingsRef.current)}
          onChange={handleHeaderFooterChange}
          onClose={() => setHfDialogOpen(false)}
        />
      )}
    </AppLayout>
  );
}