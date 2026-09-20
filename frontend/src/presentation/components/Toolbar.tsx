import { useEffect, useReducer, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  FaAlignCenter,
  FaAlignJustify,
  FaAlignLeft,
  FaAlignRight,
  FaBold,
  FaEraser,
  FaHighlighter,
  FaImage,
  FaIndent,
  FaItalic,
  FaLink,
  FaListOl,
  FaListUl,
  FaOutdent,
  FaPalette,
  FaPrint,
  FaQuoteRight,
  FaRedo,
  FaTable,
  FaUndo,
} from 'react-icons/fa';
import { ZOOM_PRESETS } from '../../domain/models/PageSettings';

interface ToolbarProps {
  editor: Editor | null;
  zoom?: number;
  onZoomChange?: (next: number) => void;
  onPrint?: () => void;
  onImageUpload?: () => void;
}

interface ToolbarButtonProps {
  action: () => void;
  icon: ReactNode;
  title: string;
  isActive?: boolean;
}

function ToolbarButton({ action, icon, title, isActive = false }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
      title={title}
      className={`p-2 rounded-lg flex items-center justify-center min-w-9 h-9 transition-all duration-200 ${
        isActive
          ? 'bg-accent-soft text-accent shadow-[0_0_12px_var(--accent-soft)]'
          : 'text-ink-muted hover:bg-soft hover:text-ink'
      }`}
    >
      {icon}
    </button>
  );
}

const Separator = () => <div className="w-px h-6 bg-[var(--border)] mx-1 shrink-0" />;

const selectCls =
  'h-9 rounded-lg bg-surface text-xs text-ink-muted border border-[var(--border)] px-1 focus:outline-none hover:bg-soft hover:text-ink transition-colors';

const LINE_QUICK: { label: string; value: string }[] = [
  { label: 'Single', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: 'Double', value: '2' },
];

export function Toolbar({ editor, zoom, onZoomChange, onPrint, onImageUpload }: ToolbarProps) {
  // Re-render on every editor transaction/selection change so active states
  // and dropdown values never go stale (EditorPage itself rarely re-renders).
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

  if (!editor) return null;

  const promptLink = () => {
    const current = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', current ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().toggleLink({ href: url }).run();
    }
  };

  const promptImage = () => {
    if (onImageUpload) {
      onImageUpload();
      return;
    }
    const url = window.prompt('Enter image URL');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const blockType = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'paragraph';

  const applyStyle = (v: string) => {
    if (v === 'paragraph') editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
  };

  const curLineHeight = (() => {
    const a = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph');
    return String(a?.lineHeight ?? '');
  })();

  const setLineHeight = (v: string | null) => {
    const patch = { lineHeight: v };
    if (editor.isActive('heading')) editor.chain().focus().updateAttributes('heading', patch).run();
    else editor.chain().focus().updateAttributes('paragraph', patch).run();
  };

  const indentBy = (deltaMm: number) => {
    const type = editor.isActive('heading') ? 'heading' : 'paragraph';
    const cur = parseFloat(String(editor.getAttributes(type).paddingLeft ?? '0')) || 0;
    const next = Math.max(0, Math.round((cur + deltaMm) * 10) / 10);
    editor
      .chain()
      .focus()
      .updateAttributes(type, { paddingLeft: next > 0 ? `${next}mm` : null })
      .run();
  };

  const clearFormatting = () => {
    editor.chain().focus().unsetAllMarks().run();
    const patch = { lineHeight: null, marginTop: null, marginBottom: null, textIndent: null, paddingLeft: null };
    if (editor.isActive('heading')) editor.chain().focus().updateAttributes('heading', patch).run();
    else editor.chain().focus().updateAttributes('paragraph', patch).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl bg-surface border border-[var(--border)] shadow-[var(--shadow-sm)] px-2 py-1.5 no-print">
      {/* Print */}
      {onPrint && (
        <>
          <ToolbarButton action={onPrint} icon={<FaPrint size={13} />} title="Print" />
          <Separator />
        </>
      )}

      {/* History */}
      <ToolbarButton action={() => editor.chain().focus().undo().run()} icon={<FaUndo size={13} />} title="Undo" />
      <ToolbarButton action={() => editor.chain().focus().redo().run()} icon={<FaRedo size={13} />} title="Redo" />
      <Separator />

      {/* Zoom */}
      {zoom !== undefined && onZoomChange && (
        <>
          <select
            value={String(zoom)}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            title="Zoom"
            className={selectCls}
          >
            {ZOOM_PRESETS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          <Separator />
        </>
      )}

      {/* Styles */}
      <select
        value={blockType}
        onChange={(e) => applyStyle(e.target.value)}
        title="Styles"
        className={`${selectCls} max-w-32`}
      >
        <option value="paragraph">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Separator />

      {/* Font family & size */}
      <select
        value={editor.getAttributes('textStyle').fontFamily || ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        title="Font family"
        className={selectCls}
      >
        <option value="">Font</option>
        <option value="Arial">Arial</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Georgia">Georgia</option>
        <option value="Verdana">Verdana</option>
        <option value="Courier New">Courier New</option>
      </select>
      <select
        value={editor.getAttributes('textStyle').fontSize || ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setMark('textStyle', { fontSize: `${v}pt` }).run();
          else editor.chain().focus().unsetMark('textStyle', { extendEmptyMarkRange: true }).run();
        }}
        title="Font size"
        className={selectCls}
      >
        <option value="">Size</option>
        <option value="10">10</option>
        <option value="11">11</option>
        <option value="12">12</option>
        <option value="14">14</option>
        <option value="16">16</option>
        <option value="18">18</option>
        <option value="20">20</option>
        <option value="24">24</option>
        <option value="28">28</option>
        <option value="36">36</option>
      </select>
      <Separator />

      {/* Inline styling */}
      <ToolbarButton action={() => editor.chain().focus().toggleBold().run()} icon={<FaBold size={13} />} title="Bold" isActive={editor.isActive('bold')} />
      <ToolbarButton action={() => editor.chain().focus().toggleItalic().run()} icon={<FaItalic size={13} />} title="Italic" isActive={editor.isActive('italic')} />
      <ToolbarButton action={() => editor.chain().focus().toggleUnderline().run()} icon={<span className="text-sm underline font-semibold">U</span>} title="Underline" isActive={editor.isActive('underline')} />
      <Separator />

      {/* Text + highlight color */}
      <div className="relative group">
        <input
          type="color"
          value={editor.getAttributes('textStyle').color ?? '#000000'}
          onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-label="Text color"
        />
        <div className="p-2 rounded-lg flex items-center justify-center min-w-9 h-9 text-ink-muted group-hover:bg-soft group-hover:text-ink transition-all">
          <span className="text-sm font-semibold">A</span>
          <span
            className="w-2 h-2 rounded-full ml-1 border border-[var(--border-strong)]"
            style={{ backgroundColor: editor.getAttributes('textStyle').color ?? '#000000' }}
          />
        </div>
      </div>
      <div className="relative group">
        <input
          type="color"
          value={editor.getAttributes('highlight').color ?? '#ffff00'}
          onInput={(e) => editor.chain().focus().setHighlight({ color: (e.target as HTMLInputElement).value }).run()}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-label="Highlight color"
        />
        <div className="p-2 rounded-lg flex items-center justify-center min-w-9 h-9 text-ink-muted group-hover:bg-soft group-hover:text-ink transition-all">
          <FaHighlighter size={13} />
          <span
            className="w-2 h-2 rounded-full ml-1 border border-[var(--border-strong)]"
            style={{ backgroundColor: editor.getAttributes('highlight').color ?? '#ffff00' }}
          />
        </div>
      </div>
      <Separator />

      {/* Links & tables */}
      <ToolbarButton action={promptLink} icon={<FaLink size={13} />} title="Link" isActive={editor.isActive('link')} />
      <ToolbarButton
        action={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        icon={<FaTable size={13} />}
        title="Insert table"
        isActive={editor.isActive('table')}
      />
      <ToolbarButton action={promptImage} icon={<FaImage size={13} />} title="Insert image" />
      <Separator />

      {/* Alignment */}
      <ToolbarButton action={() => editor.chain().focus().setTextAlign('left').run()} icon={<FaAlignLeft size={13} />} title="Align left" isActive={editor.isActive({ textAlign: 'left' })} />
      <ToolbarButton action={() => editor.chain().focus().setTextAlign('center').run()} icon={<FaAlignCenter size={13} />} title="Align center" isActive={editor.isActive({ textAlign: 'center' })} />
      <ToolbarButton action={() => editor.chain().focus().setTextAlign('right').run()} icon={<FaAlignRight size={13} />} title="Align right" isActive={editor.isActive({ textAlign: 'right' })} />
      <ToolbarButton action={() => editor.chain().focus().setTextAlign('justify').run()} icon={<FaAlignJustify size={13} />} title="Justify" isActive={editor.isActive({ textAlign: 'justify' })} />
      <Separator />

      {/* Line spacing */}
      <select
        value={curLineHeight}
        onChange={(e) => setLineHeight(e.target.value === '' ? null : e.target.value)}
        title="Line spacing"
        className={selectCls}
      >
        <option value="">↕</option>
        {LINE_QUICK.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Separator />

      {/* Lists */}
      <ToolbarButton action={() => editor.chain().focus().toggleBulletList().run()} icon={<FaListUl size={13} />} title="Bullet list" isActive={editor.isActive('bulletList')} />
      <ToolbarButton action={() => editor.chain().focus().toggleOrderedList().run()} icon={<FaListOl size={13} />} title="Numbered list" isActive={editor.isActive('orderedList')} />
      <ToolbarButton action={() => editor.chain().focus().toggleBlockquote().run()} icon={<FaQuoteRight size={13} />} title="Quote" isActive={editor.isActive('blockquote')} />
      <ToolbarButton action={() => editor.chain().focus().toggleCodeBlock().run()} icon={<span className="text-[10px] font-bold">{'{ }'}</span>} title="Code block" isActive={editor.isActive('codeBlock')} />
      <Separator />

      {/* Indents */}
      <ToolbarButton action={() => indentBy(-5)} icon={<FaOutdent size={13} />} title="Decrease indent" />
      <ToolbarButton action={() => indentBy(5)} icon={<FaIndent size={13} />} title="Increase indent" />
      <Separator />

      {/* Clear formatting */}
      <ToolbarButton action={clearFormatting} icon={<FaEraser size={13} />} title="Clear formatting" />
    </div>
  );
}
