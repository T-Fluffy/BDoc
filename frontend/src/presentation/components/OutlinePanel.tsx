import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

interface OutlineEntry {
  level: number;
  text: string;
  pos: number;
}

interface OutlinePanelProps {
  editor: Editor | null;
}

export default function OutlinePanel({ editor }: OutlinePanelProps) {
  const [entries, setEntries] = useState<OutlineEntry[]>([]);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const out: OutlineEntry[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          const text = node.textContent.slice(0, 80);
          if (text.trim()) {
            out.push({ level: node.attrs.level as number, text, pos });
          }
        }
      });
      setEntries(out);
    };
    update();
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    return () => {
      editor.off('update', update);
      editor.off('selectionUpdate', update);
    };
  }, [editor]);

  if (entries.length === 0) {
    return <div className="text-xs text-ink-faint p-4">No headings yet. Use H1–H3 to build outline.</div>;
  }

  return (
    <div className="py-2">
      <div className="text-[10px] uppercase tracking-widest text-ink-faint px-4 mb-2">Outline</div>
      <ul className="space-y-0.5">
        {entries.map((e, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => {
                editor?.chain().focus().setTextSelection(e.pos).run();
                // Scroll into view
                const dom = editor?.view.domAtPos(e.pos);
                (dom?.node as HTMLElement)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
              }}
              className="w-full text-left px-4 py-1 text-sm hover:bg-soft hover:text-ink transition-colors truncate"
              style={{ paddingLeft: `${16 + (e.level - 1) * 12}px` }}
              title={e.text}
            >
              <span className="text-ink-faint mr-2 text-xs">H{e.level}</span>
              {e.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
