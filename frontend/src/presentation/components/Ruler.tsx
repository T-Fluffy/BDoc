import { useEffect, useReducer, useRef } from 'react';
import type { Editor } from '@tiptap/react';

interface RulerProps {
  editor: Editor | null;
  pageWidthMm: number;
  marginMm: number;
  onMarginChange: (mm: number) => void;
}

const roundHalf = (v: number) => Math.round(v * 2) / 2;

function parseMm(v: string | null | undefined): number {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Word-like horizontal ruler: margin shading, cm ticks, draggable margin
 * handles, plus first-line / left indent markers bound to the current
 * paragraph (or heading). Positions are fractions of the page width, so they
 * stay truthful at any zoom level. Dragging either margin handle sets the
 * uniform page margin; dragging indent markers edits the current block
 * without moving focus (no scroll jumps while dragging).
 */
export default function Ruler({ editor, pageWidthMm, marginMm, onMarginChange }: RulerProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragMargin = useRef<'left' | 'right' | null>(null);
  const dragIndent = useRef<'first' | 'left' | null>(null);

  // Re-render on selection/transaction so markers track the caret block.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    const refresh = () => forceUpdate();
    editor.on('transaction', refresh);
    editor.on('selectionUpdate', refresh);
    return () => {
      editor.off('transaction', refresh);
      editor.off('selectionUpdate', refresh);
    };
  }, [editor]);

  const pct = (mm: number) => `${(mm / pageWidthMm) * 100}%`;
  const mmFromClientX = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return marginMm;
    return ((clientX - r.left) / r.width) * pageWidthMm;
  };

  // ---- margins (unchanged behavior) ----
  const onMarginDown = (side: 'left' | 'right') => (e: React.PointerEvent<HTMLDivElement>) => {
    dragMargin.current = side;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMarginMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMargin.current) return;
    const raw =
      dragMargin.current === 'left' ? mmFromClientX(e.clientX) : pageWidthMm - mmFromClientX(e.clientX);
    const clamped = Math.min(pageWidthMm / 2, Math.max(0, raw));
    onMarginChange(roundHalf(clamped));
  };
  const endMarginDrag = () => {
    dragMargin.current = null;
  };

  // ---- indents (current block) ----
  const blockType = editor && editor.isActive('heading') ? 'heading' : 'paragraph';
  const blockAttrs = editor ? editor.getAttributes(blockType) : {};
  const padLeft = parseMm(blockAttrs?.paddingLeft);
  const textIndent = parseMm(blockAttrs?.textIndent);
  const tabStops: number[] = Array.isArray(blockAttrs?.tabStops)
    ? (blockAttrs.tabStops as unknown[]).filter((n): n is number => typeof n === 'number')
    : [];

  const applyIndent = (patch: { textIndent?: string | null; paddingLeft?: string | null }) => {
    if (!editor) return;
    const type = editor.isActive('heading') ? 'heading' : 'paragraph';
    // No focus(): dragging must not scroll the document.
    editor.chain().updateAttributes(type, patch).run();
  };
  const onIndentDown = (kind: 'first' | 'left') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragIndent.current = kind;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onIndentMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragIndent.current || !editor) return;
    // Indents are relative to the content area (inside margins).
    const raw = mmFromClientX(e.clientX) - marginMm;
    if (dragIndent.current === 'first') {
      const v = Math.min(50, Math.max(-25, raw));
      applyIndent({ textIndent: v === 0 ? null : `${roundHalf(v)}mm` });
    } else {
      const v = Math.min(100, Math.max(0, raw));
      applyIndent({ paddingLeft: v === 0 ? null : `${roundHalf(v)}mm` });
    }
  };
  const endIndentDrag = () => {
    dragIndent.current = null;
  };

  // ---- tab stops (current block, relative to content area) ----
  const dragTab = useRef<number | null>(null); // index into current stops, or -1 for a fresh add-drag

  const setStops = (stops: number[]) => {
    if (!editor) return;
    const clean = [...new Set(stops.filter((n) => Number.isFinite(n) && n >= 0 && n <= 500))]
      .sort((a, b) => a - b)
      .slice(0, 24);
    const type = editor.isActive('heading') ? 'heading' : 'paragraph';
    editor.chain().updateAttributes(type, { tabStops: clean.length > 0 ? clean : null }).run();
  };

  const contentMmFromClientX = (clientX: number) => mmFromClientX(clientX) - marginMm;

  // Click on empty track adds a stop; markers/handles handle their own drags.
  const onTrackDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest('.bdoc-ruler-handle, .bdoc-ruler-indent, .bdoc-ruler-tab')) return;
    const mm = roundHalf(Math.min(300, Math.max(0, contentMmFromClientX(e.clientX))));
    setStops([...tabStops, mm]);
  };

  const onTabDown = (index: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragTab.current = index;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTabMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragTab.current === null || !editor) return;
    const mm = roundHalf(Math.min(300, Math.max(0, contentMmFromClientX(e.clientX))));
    const next = [...tabStops];
    next[dragTab.current] = mm;
    // Re-resolve the index: setStops sorts, so the dragged stop may shift.
    dragTab.current = [...next].sort((a, b) => a - b).indexOf(mm);
    setStops(next);
  };
  const onTabUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragTab.current === null) return;
    const bar = barRef.current?.getBoundingClientRect();
    // Dragged off the ruler vertically → remove the stop (Word behavior).
    if (bar && (e.clientY < bar.top - 8 || e.clientY > bar.bottom + 8)) {
      const next = [...tabStops];
      next.splice(dragTab.current, 1);
      setStops(next);
    }
    dragTab.current = null;
  };

  const minorStep = pct(2);
  const mediumStep = pct(10);
  const labels: number[] = [];
  for (let m = 10; m < pageWidthMm; m += 10) labels.push(m);

  const clampPct = (mm: number) => `${Math.min(100, Math.max(0, (mm / pageWidthMm) * 100))}%`;
  const firstPos = marginMm + padLeft + textIndent;
  const leftPos = marginMm + padLeft;

  return (
    <div
      ref={barRef}
      className="bdoc-ruler no-print"
      role="slider"
      aria-label="Page margins"
      aria-valuenow={marginMm}
      onPointerDown={onTrackDown}
    >
      <div className="bdoc-ruler-shade" style={{ left: 0, width: pct(marginMm) }} />
      <div className="bdoc-ruler-shade" style={{ right: 0, width: pct(marginMm) }} />
      <div
        className="bdoc-ruler-ticks"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, var(--ruler-tick) 0 1px, transparent 1px ${mediumStep}), repeating-linear-gradient(90deg, var(--ruler-tick) 0 1px, transparent 1px ${minorStep})`,
          backgroundSize: `100% 9px, 100% 5px`,
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'bottom left',
        }}
      />
      {labels.map((m) => (
        <span key={m} className="bdoc-ruler-label" style={{ left: pct(m) }}>
          {m / 10}
        </span>
      ))}
      <div
        className="bdoc-ruler-handle"
        style={{ left: pct(marginMm) }}
        title={`Left margin: ${marginMm.toFixed(1)} mm — drag to change`}
        onPointerDown={onMarginDown('left')}
        onPointerMove={onMarginMove}
        onPointerUp={endMarginDrag}
        onPointerCancel={endMarginDrag}
      />
      <div
        className="bdoc-ruler-handle"
        style={{ left: `calc(100% - ${pct(marginMm)})` }}
        title={`Right margin: ${marginMm.toFixed(1)} mm — drag to change`}
        onPointerDown={onMarginDown('right')}
        onPointerMove={onMarginMove}
        onPointerUp={endMarginDrag}
        onPointerCancel={endMarginDrag}
      />
      {editor && (
        <>
          <div
            className="bdoc-ruler-indent first"
            style={{ left: clampPct(firstPos) }}
            title={`First-line indent: ${textIndent.toFixed(1)} mm — drag to change`}
            onPointerDown={onIndentDown('first')}
            onPointerMove={onIndentMove}
            onPointerUp={endIndentDrag}
            onPointerCancel={endIndentDrag}
          />
          <div
            className="bdoc-ruler-indent left"
            style={{ left: clampPct(leftPos) }}
            title={`Left indent: ${padLeft.toFixed(1)} mm — drag to change`}
            onPointerDown={onIndentDown('left')}
            onPointerMove={onIndentMove}
            onPointerUp={endIndentDrag}
            onPointerCancel={endIndentDrag}
          />
          {tabStops.map((s, i) => (
            <div
              key={`${s}-${i}`}
              className="bdoc-ruler-tab"
              style={{ left: clampPct(marginMm + s) }}
              title={`Tab stop at ${s.toFixed(1)} mm — drag to move, drag off to remove`}
              onPointerDown={onTabDown(i)}
              onPointerMove={onTabMove}
              onPointerUp={onTabUp}
              onPointerCancel={onTabUp}
            />
          ))}
        </>
      )}
    </div>
  );
}
