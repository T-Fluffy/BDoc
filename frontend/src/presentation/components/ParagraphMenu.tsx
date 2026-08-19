import type { Editor } from '@tiptap/react';
import { FaEraser } from 'react-icons/fa';

interface Props {
  editor: Editor;
  onClose: () => void;
}

const LINE_SPACING = ['1', '1.15', '1.5', '1.8', '2', '2.5'];
const SPACING_PT = ['0', '6', '12', '18', '24', '36', '48'];
const INDENT_MM = ['0', '5', '10', '15', '20', '25'];

function strip(v: string | null | undefined): string {
  if (!v) return '';
  return v.replace(/[^0-9.]/g, '');
}

export default function ParagraphMenu({ editor, onClose }: Props) {
  const attrs = editor.isActive('heading')
    ? editor.getAttributes('heading')
    : editor.getAttributes('paragraph');

  const apply = (patch: Record<string, string | null>) => {
    if (editor.isActive('heading')) {
      editor.chain().focus().updateAttributes('heading', patch).run();
    } else {
      editor.chain().focus().updateAttributes('paragraph', patch).run();
    }
  };

  const clearAll = () => {
    apply({
      lineHeight: null,
      marginTop: null,
      marginBottom: null,
      textIndent: null,
      paddingLeft: null,
    });
    onClose();
  };

  const row = (label: string, value: string, options: string[], onPick: (v: string) => void) => (
    <label className="block mb-3 last:mb-1">
      <span className="text-[10px] uppercase tracking-widest text-ink-faint block mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onPick(e.target.value)}
        className="w-full h-8 rounded-lg bg-surface text-xs text-ink-muted border border-[var(--border)] px-2 focus:outline-none hover:bg-soft hover:text-ink transition-colors"
      >
        <option value="">Default</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-ink-faint mb-2.5 text-center">
        Paragraph format
      </p>

      {row(
        'Line spacing',
        attrs.lineHeight ? strip(attrs.lineHeight) : '',
        LINE_SPACING,
        (v) => apply(v ? { lineHeight: v } : { lineHeight: null }),
      )}

      {row(
        'Space before (pt)',
        strip(attrs.marginTop),
        SPACING_PT,
        (v) => apply(v !== '' ? { marginTop: `${v}pt` } : { marginTop: null }),
      )}

      {row(
        'Space after (pt)',
        strip(attrs.marginBottom),
        SPACING_PT,
        (v) => apply(v !== '' ? { marginBottom: `${v}pt` } : { marginBottom: null }),
      )}

      {row(
        'Left indent (mm)',
        strip(attrs.paddingLeft),
        INDENT_MM,
        (v) => apply(v !== '' ? { paddingLeft: `${v}mm` } : { paddingLeft: null }),
      )}

      {row(
        'First line indent (mm)',
        strip(attrs.textIndent),
        INDENT_MM,
        (v) => apply(v !== '' ? { textIndent: `${v}mm` } : { textIndent: null }),
      )}

      <button
        onClick={clearAll}
        className="w-full flex items-center justify-center gap-2 mt-3 py-2 rounded-lg text-xs text-ink-muted hover:text-danger hover:bg-danger-soft transition-colors border border-[var(--border)]"
      >
        <FaEraser size={11} />
        Remove paragraph formatting
      </button>
    </div>
  );
}