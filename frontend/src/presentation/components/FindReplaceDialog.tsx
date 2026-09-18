import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';

interface FindReplaceDialogProps {
  editor: Editor;
  onClose: () => void;
}

interface Match {
  from: number;
  to: number;
}

/**
 * Find & replace over the whole document. Matches are navigated via real
 * text selections (no highlight marks touch the content, so nothing can leak
 * into saves/exports). Positions recompute after every edit.
 */
export default function FindReplaceDialog({ editor, onClose }: FindReplaceDialogProps) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    findRef.current?.focus();
    findRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Recompute when the document changes underneath us.
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    editor.on('update', bump);
    return () => {
      editor.off('update', bump);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const matches: Match[] = useMemo(() => {
    void tick;
    if (!find) return [];
    const frag = caseSensitive ? find : find.toLowerCase();
    const out: Match[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const text = caseSensitive ? node.text : node.text.toLowerCase();
      let i = 0;
      while (i <= text.length - frag.length) {
        const at = text.indexOf(frag, i);
        if (at === -1) break;
        out.push({ from: pos + at, to: pos + at + frag.length });
        i = at + frag.length;
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, find, caseSensitive, tick]);

  const safeIdx = matches.length === 0 ? 0 : ((matchIdx % matches.length) + matches.length) % matches.length;

  const goto = (i: number) => {
    if (matches.length === 0) return;
    const idx = ((i % matches.length) + matches.length) % matches.length;
    startedRef.current = true;
    setMatchIdx(idx);
    const m = matches[idx];
    editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).run();
  };

  const onFindChange = (v: string) => {
    setFind(v);
    setMatchIdx(0);
    startedRef.current = false;
  };

  const replaceOne = () => {
    const m = matches[safeIdx];
    if (!m) return;
    const marks = editor.state.doc.resolve(m.from).marks();
    const tr = editor.state.tr.replaceWith(
      m.from,
      m.to,
      replace ? editor.state.schema.text(replace, marks) : [],
    );
    editor.view.dispatch(tr);
    setTick((t) => t + 1);
  };

  const replaceAll = () => {
    if (matches.length === 0) return;
    let tr = editor.state.tr;
    for (let k = matches.length - 1; k >= 0; k--) {
      const m = matches[k];
      const marks = tr.doc.resolve(m.from).marks();
      if (replace) tr = tr.replaceWith(m.from, m.to, editor.state.schema.text(replace, marks));
      else tr = tr.delete(m.from, m.to);
    }
    editor.view.dispatch(tr);
    setMatchIdx(0);
    setTick((t) => t + 1);
  };

  const inputCls =
    'w-full h-9 rounded-lg bg-surface text-sm text-ink border border-[var(--border)] px-2.5 focus:outline-none focus:border-[var(--border-strong)] placeholder:text-ink-faint';

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-24 bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Find and replace"
        className="w-[min(480px,92vw)] rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">Find and replace</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
          >
            Done
          </button>
        </div>

        <div className="space-y-3">
          <input
            ref={findRef}
            value={find}
            onChange={(e) => onFindChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!startedRef.current) goto(0);
                else goto(safeIdx + (e.shiftKey ? -1 : 1));
              }
            }}
            placeholder="Find in document"
            className={inputCls}
          />
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="Replace with"
            className={inputCls}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => {
                  setCaseSensitive(e.target.checked);
                  setMatchIdx(0);
                  startedRef.current = false;
                }}
                className="accent-[var(--accent)]"
              />
              Match case
            </label>
            <span className="text-xs text-ink-faint">
              {matches.length === 0
                ? find
                  ? 'No matches'
                  : ' '
                : startedRef.current
                  ? `${safeIdx + 1} of ${matches.length}`
                  : `${matches.length} match${matches.length === 1 ? '' : 'es'}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goto(safeIdx - 1)}
              disabled={matches.length === 0}
              className="px-3 py-1.5 rounded-lg text-sm bg-soft text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => goto(safeIdx + 1)}
              disabled={matches.length === 0}
              className="px-3 py-1.5 rounded-lg text-sm bg-soft text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              Next ›
            </button>
            <span className="flex-1" />
            <button
              onClick={replaceOne}
              disabled={matches.length === 0}
              className="px-3 py-1.5 rounded-lg text-sm bg-soft text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              Replace
            </button>
            <button
              onClick={replaceAll}
              disabled={matches.length === 0}
              className="px-3 py-1.5 rounded-lg text-sm bg-accent-soft text-accent hover:brightness-110 transition-all disabled:opacity-50"
            >
              Replace all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
