import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { CellSelection } from '@tiptap/pm/tables';

interface TableContextMenuProps {
  editor: Editor;
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * Right-click menu for tables (Docs-style): rows/columns, merge/split,
 * header row, delete. No-ops silently when the command can't apply.
 */
export default function TableContextMenu({ editor, x, y, onClose }: TableContextMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const inCellSelection =
    editor.state.selection instanceof CellSelection &&
    (editor.state.selection as CellSelection).$anchorCell.pos !==
      (editor.state.selection as CellSelection).$headCell.pos;

  const left = Math.max(8, Math.min(x, window.innerWidth - 264));
  const top = Math.max(8, Math.min(y, window.innerHeight - 340));

  const itemCls =
    'w-full flex items-center gap-3 p-2.5 rounded-lg text-sm text-ink-muted hover:text-ink hover:bg-soft transition-colors disabled:opacity-60 text-left';
  const btn = (label: string, action: () => void, disabled = false) => (
    <button key={label} onClick={run(action)} disabled={disabled} className={itemCls}>
      {label}
    </button>
  );
  const div = (key: string) => <div key={key} className="my-1 border-t border-[var(--border)]" />;

  return (
    <>
      <div className="fixed inset-0 z-[290]" onClick={onClose} />
      <div
        className="fixed w-64 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] p-1.5 z-[300]"
        style={{ left, top }}
        role="menu"
        aria-label="Table"
      >
        {btn('Insert row above', () => editor.chain().focus().addRowBefore().run())}
        {btn('Insert row below', () => editor.chain().focus().addRowAfter().run())}
        {btn('Insert column left', () => editor.chain().focus().addColumnBefore().run())}
        {btn('Insert column right', () => editor.chain().focus().addColumnAfter().run())}
        {div('d1')}
        {btn('Delete row', () => editor.chain().focus().deleteRow().run())}
        {btn('Delete column', () => editor.chain().focus().deleteColumn().run())}
        {div('d2')}
        {btn('Merge cells', () => editor.chain().focus().mergeCells().run(), !inCellSelection)}
        {btn('Split cell', () => editor.chain().focus().splitCell().run())}
        {btn('Toggle header row', () => editor.chain().focus().toggleHeaderRow().run())}
        {div('d3')}
        {btn('Delete table', () => editor.chain().focus().deleteTable().run())}
      </div>
    </>
  );
}
