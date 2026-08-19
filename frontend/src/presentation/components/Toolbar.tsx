import { useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  FaAlignCenter,
  FaAlignJustify,
  FaAlignLeft,
  FaAlignRight,
  FaBold,
  FaCode,
  FaHighlighter,
  FaItalic,
  FaLink,
  FaListOl,
  FaListUl,
  FaPalette,
  FaParagraph,
  FaQuoteRight,
  FaRedo,
  FaStrikethrough,
  FaTable,
  FaUndo,
} from 'react-icons/fa';
import ParagraphMenu from './ParagraphMenu';

interface ToolbarProps {
  editor: Editor | null;
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

export function Toolbar({ editor }: ToolbarProps) {
  const [paraOpen, setParaOpen] = useState(false);

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

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl bg-surface border border-[var(--border)] shadow-[var(--shadow-sm)] px-2 py-1.5 no-print">
      {/* History */}
      <ToolbarButton action={() => editor.chain().focus().undo().run()} icon={<FaUndo size={13} />} title="Undo" />
      <ToolbarButton action={() => editor.chain().focus().redo().run()} icon={<FaRedo size={13} />} title="Redo" />
      <Separator />

      {/* Headings */}
      <ToolbarButton
        action={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        icon={<span className="font-bold text-[10px]">H1</span>}
        title="Heading 1"
        isActive={editor.isActive('heading', { level: 1 })}
      />
      <ToolbarButton
        action={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        icon={<span className="font-bold text-[10px]">H2</span>}
        title="Heading 2"
        isActive={editor.isActive('heading', { level: 2 })}
      />
      <ToolbarButton
        action={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        icon={<span className="font-bold text-[10px]">H3</span>}
        title="Heading 3"
        isActive={editor.isActive('heading', { level: 3 })}
      />
      <Separator />

      {/* Inline styling */}
      <ToolbarButton action={() => editor.chain().focus().toggleBold().run()} icon={<FaBold size={13} />} title="Bold" isActive={editor.isActive('bold')} />
      <ToolbarButton action={() => editor.chain().focus().toggleItalic().run()} icon={<FaItalic size={13} />} title="Italic" isActive={editor.isActive('italic')} />
      <ToolbarButton action={() => editor.chain().focus().toggleUnderline().run()} icon={<span className="text-sm underline font-semibold">U</span>} title="Underline" isActive={editor.isActive('underline')} />
      <ToolbarButton action={() => editor.chain().focus().toggleStrike().run()} icon={<FaStrikethrough size={13} />} title="Strikethrough" isActive={editor.isActive('strike')} />
      <ToolbarButton action={() => editor.chain().focus().toggleCode().run()} icon={<FaCode size={13} />} title="Inline code" isActive={editor.isActive('code')} />
      <ToolbarButton action={() => editor.chain().focus().toggleHighlight().run()} icon={<FaHighlighter size={13} />} title="Highlight" isActive={editor.isActive('highlight')} />
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
        className="h-9 rounded-lg bg-surface text-xs text-ink-muted border border-[var(--border)] px-2 focus:outline-none hover:bg-soft hover:text-ink transition-colors"
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
        className="h-9 rounded-lg bg-surface text-xs text-ink-muted border border-[var(--border)] px-1 focus:outline-none hover:bg-soft hover:text-ink transition-colors"
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

      {/* Text color */}
      <div className="relative group">
        <input
          type="color"
          value={editor.getAttributes('textStyle').color ?? '#000000'}
          onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-label="Text color"
        />
        <div className="p-2 rounded-lg flex items-center justify-center min-w-9 h-9 text-ink-muted group-hover:bg-soft group-hover:text-ink transition-all">
          <FaPalette size={13} />
          <span
            className="w-2 h-2 rounded-full ml-1 border border-[var(--border-strong)]"
            style={{ backgroundColor: editor.getAttributes('textStyle').color ?? '#000000' }}
          />
        </div>
      </div>
      <Separator />

      {/* Lists & blocks */}
      <ToolbarButton action={() => editor.chain().focus().toggleBulletList().run()} icon={<FaListUl size={13} />} title="Bullet list" isActive={editor.isActive('bulletList')} />
      <ToolbarButton action={() => editor.chain().focus().toggleOrderedList().run()} icon={<FaListOl size={13} />} title="Numbered list" isActive={editor.isActive('orderedList')} />
      <ToolbarButton action={() => editor.chain().focus().toggleBlockquote().run()} icon={<FaQuoteRight size={13} />} title="Quote" isActive={editor.isActive('blockquote')} />
      <ToolbarButton action={() => editor.chain().focus().toggleCodeBlock().run()} icon={<span className="text-[10px] font-bold">{'{ }'}</span>} title="Code block" isActive={editor.isActive('codeBlock')} />
      <Separator />

      {/* Links & tables */}
      <ToolbarButton action={promptLink} icon={<FaLink size={13} />} title="Link" isActive={editor.isActive('link')} />
      <ToolbarButton
        action={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        icon={<FaTable size={13} />}
        title="Insert table"
        isActive={editor.isActive('table')}
      />
      <Separator />

      {/* Alignment */}
      <ToolbarButton action={() => editor.chain().focus().setTextAlign('left').run()} icon={<FaAlignLeft size={13} />} title="Align left" isActive={editor.isActive({ textAlign: 'left' })} />
      <ToolbarButton action={() => editor.chain().focus().setTextAlign('center').run()} icon={<FaAlignCenter size={13} />} title="Align center" isActive={editor.isActive({ textAlign: 'center' })} />
      <ToolbarButton action={() => editor.chain().focus().setTextAlign('right').run()} icon={<FaAlignRight size={13} />} title="Align right" isActive={editor.isActive({ textAlign: 'right' })} />
      <ToolbarButton action={() => editor.chain().focus().setTextAlign('justify').run()} icon={<FaAlignJustify size={13} />} title="Justify" isActive={editor.isActive({ textAlign: 'justify' })} />
      <Separator />

      {/* Paragraph format */}
      <div className="relative">
        <ToolbarButton
          action={() => setParaOpen((o) => !o)}
          icon={<FaParagraph size={13} />}
          title="Paragraph format"
          isActive={paraOpen}
        />
        {paraOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setParaOpen(false)} />
            <div className="absolute left-0 top-full mt-1 w-60 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] p-3 z-50 animate-in fade-in zoom-in duration-150">
              <ParagraphMenu editor={editor} onClose={() => setParaOpen(false)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}