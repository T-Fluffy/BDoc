import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import {
  FaAlignCenter,
  FaAlignJustify,
  FaAlignLeft,
  FaAlignRight,
  FaBars,
  FaCog,
  FaEraser,
  FaExpand,
  FaFileAlt,
  FaFileImport,
  FaFileWord,
  FaImage,
  FaLink,
  FaListOl,
  FaListUl,
  FaMoon,
  FaPlus,
  FaPrint,
  FaSignOutAlt,
  FaSpinner,
  FaSubscript,
  FaSun,
  FaSuperscript,
  FaTable,
  FaTimesCircle,
  FaUserCircle,
} from 'react-icons/fa';
import { useTheme } from '../theme/useTheme';
import { useAuth } from '../context/AuthContext';
import DocsMenu, { type DocsMenuItem } from './DocsMenu';
import ParagraphMenu from './ParagraphMenu';
import {
  PAGE_SIZES,
  MARGIN_PRESETS,
  ZOOM_PRESETS,
  resolveHeaderFooter,
  type PageSettings,
} from '../../domain/models/PageSettings';

interface NavbarProps {
  editor?: Editor | null;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onNew?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  onPrint?: () => void;
  onCloseDocument?: () => void;
  exporting?: boolean;
  importing?: boolean;
  pageSettings?: PageSettings;
  onPageSettingsChange?: (next: PageSettings) => void;
  zoom?: number;
  onZoomChange?: (next: number) => void;
  onEditHeaderFooter?: () => void;
  showRuler?: boolean;
  onToggleRuler?: () => void;
  showStatusBar?: boolean;
  onToggleStatusBar?: () => void;
  onFindReplace?: () => void;
  onWordCount?: () => void;
  onHelp?: () => void;
  onVersionHistory?: () => void;
  title?: string;
  onTitleChange?: (value: string) => void;
  titleStatus?: ReactNode;
  onImageUpload?: () => void;
  onInsertToc?: () => void;
  onAddComment?: () => void;
}

export default function NavbarComponent({
  editor,
  onToggleSidebar,
  onOpenSettings,
  onNew,
  onImport,
  onExport,
  onPrint,
  onCloseDocument,
  exporting,
  importing,
  pageSettings,
  onPageSettingsChange,
  zoom,
  onZoomChange,
  onEditHeaderFooter,
  showRuler,
  onToggleRuler,
  showStatusBar,
  onToggleStatusBar,
  onFindReplace,
  onWordCount,
  onHelp,
  onVersionHistory,
  title,
  onTitleChange,
  titleStatus,
  onImageUpload,
  onInsertToc,
  onAddComment,
}: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, setMode } = useTheme();
  const { logout } = useAuth();
  const [menu, setMenu] = useState<
    'insert' | 'file' | 'page' | 'user' | 'zoom' | 'edit' | 'view' | 'format' | 'tools' | 'help' | null
  >(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((t) => t + 1);
    editor.on('update', bump);
    return () => {
      editor.off('update', bump);
    };
  }, [editor]);

  const updatePage = (patch: Partial<PageSettings>) => {
    if (pageSettings && onPageSettingsChange) {
      onPageSettingsChange({ ...pageSettings, ...patch });
    }
  };

  const isEditing = location.pathname.includes('/editor/');

  const closeMenu = () => setMenu(null);

  const addImage = () => {
    if (onImageUpload) {
      onImageUpload();
    } else {
      const url = window.prompt('Enter image URL');
      if (url && editor) editor.chain().focus().setImage({ src: url }).run();
    }
    closeMenu();
  };

  const addTable = () => {
    if (editor) editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    closeMenu();
  };

  const promptLink = () => {
    if (!editor) return;
    const current = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', current ?? 'https://');
    if (url === null) return;
    if (url === '') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().toggleLink({ href: url }).run();
    closeMenu();
  };

  const clearFormatting = () => {
    if (!editor) return;
    editor.chain().focus().unsetAllMarks().run();
    const patch = { lineHeight: null, marginTop: null, marginBottom: null, textIndent: null, paddingLeft: null };
    if (editor.isActive('heading')) editor.chain().focus().updateAttributes('heading', patch).run();
    else editor.chain().focus().updateAttributes('paragraph', patch).run();
    closeMenu();
  };

  const setLineHeight = (v: string | null) => {
    if (!editor) return;
    const patch = { lineHeight: v };
    if (editor.isActive('heading')) editor.chain().focus().updateAttributes('heading', patch).run();
    else editor.chain().focus().updateAttributes('paragraph', patch).run();
    closeMenu();
  };

  const curLineHeight = (() => {
    if (!editor) return '';
    const a = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph');
    return String(a?.lineHeight ?? '');
  })();

  const insertUserBreak = () => {
    if (editor) editor.chain().focus().insertContent({ type: 'pageBreak', attrs: { user: true } }).run();
    closeMenu();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen().catch(() => undefined);
    closeMenu();
  };

  const commentCount = (() => {
    if (!editor) return 0;
    const ids = new Set<string>();
    editor.state.doc.descendants((node) => {
      node.marks.forEach((m) => {
        if (m.type.name === 'comment') ids.add((m.attrs as { id: string }).id);
      });
    });
    return ids.size;
  })();

  const togglePageNumbers = () => {
    if (!pageSettings || !onPageSettingsChange) return;
    const hf = resolveHeaderFooter(pageSettings);
    onPageSettingsChange({
      ...pageSettings,
      headerFooter: { ...hf, pageNumbersEnabled: !hf.pageNumbersEnabled },
    });
    closeMenu();
  };

  const pnChecked = pageSettings ? resolveHeaderFooter(pageSettings).pageNumbersEnabled : false;

  const fileOptions = [
    { label: 'New', icon: <FaPlus />, action: () => { onNew?.(); closeMenu(); }, hide: false },
    { label: 'Import Word document (.docx)', icon: importing ? <FaSpinner className="animate-spin" /> : <FaFileImport />, action: () => { onImport?.(); closeMenu(); }, hide: false },
    { label: 'Download as Word document (.docx)', icon: exporting ? <FaSpinner className="animate-spin" /> : <FaFileWord />, action: () => { onExport?.(); closeMenu(); }, hide: false },
    { label: 'Print / Export to PDF', icon: <FaPrint />, action: () => { onPrint?.(); closeMenu(); }, hide: false },
    { label: 'divider', icon: null, action: () => {}, hide: false },
    { label: 'Close document', icon: <FaTimesCircle />, action: () => { onCloseDocument?.(); closeMenu(); }, hide: false },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="shrink-0 bg-canvas/80 backdrop-blur-xl border-b border-[var(--border)] px-4 pt-2 pb-1.5 relative z-[100] no-print">
      {/* Row 1: app controls — icon, inline title, settings */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isEditing && (
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-soft transition-colors shrink-0"
              aria-label="Toggle sidebar"
            >
              <FaBars />
            </button>
          )}

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 group shrink-0"
            title="All documents"
          >
            <span className="w-7 h-7 bg-gradient-to-br from-accent to-violet-500 rounded-lg shadow-[0_0_20px_var(--accent-soft)] group-hover:scale-110 transition-transform flex items-center justify-center">
              <FaFileAlt size={13} className="text-accent-contrast" />
            </span>
            {!isEditing && (
              <span className="font-bold tracking-[0.2em] text-sm uppercase text-ink">BDoc</span>
            )}
          </button>

          {isEditing && title !== undefined && onTitleChange && (
            <div className="min-w-0 flex-1 max-w-md">
              <input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Untitled document"
                aria-label="Document title"
                spellCheck={false}
                className="w-full bg-transparent text-lg font-medium text-ink placeholder:text-ink-faint rounded px-1 -mx-1 border border-transparent hover:border-[var(--border)] focus:border-[var(--border-strong)] focus:outline-none transition-colors truncate"
              />
              {titleStatus && (
                <div className="text-[11px] leading-tight text-ink-faint truncate px-1">{titleStatus}</div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-soft transition-colors"
            title="Toggle theme"
          >
            {mode === 'dark' ? <FaSun /> : <FaMoon />}
          </button>

          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-soft transition-colors"
            title="Settings"
          >
            <FaCog />
          </button>

          <div className="relative">
            <button
              onClick={() => setMenu(menu === 'user' ? null : 'user')}
              className="ml-1 p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-soft transition-colors text-xl"
              title="Account"
            >
              <FaUserCircle />
            </button>

            {menu === 'user' && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden animate-in fade-in zoom-in duration-150">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <p className="text-[10px] text-ink-faint uppercase tracking-widest text-center">
                    Account
                  </p>
                  <p className="text-sm font-medium text-ink text-center truncate">user@bdoc.app</p>
                </div>
                <div className="p-1.5">
                  <button
                    onClick={() => {
                      navigate('/');
                      setMenu(null);
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg text-sm text-ink-muted hover:text-ink hover:bg-soft transition-colors"
                  >
                    <FaFileAlt className="text-accent" />
                    Library
                  </button>
                  <button
                    onClick={() => {
                      onOpenSettings();
                      setMenu(null);
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg text-sm text-ink-muted hover:text-ink hover:bg-soft transition-colors"
                  >
                    <FaCog className="text-accent" />
                    Settings
                  </button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg text-sm text-danger hover:bg-danger-soft transition-colors"
                  >
                    <FaSignOutAlt />
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Docs-style text menu row */}
      <div className="flex items-center gap-0.5 mt-0.5 overflow-x-auto">
        {isEditing && (
          <button
            onClick={() => navigate('/')}
            className="px-2 py-1 rounded-md text-sm whitespace-nowrap text-ink-muted hover:text-ink hover:bg-soft transition-colors hidden sm:block"
          >
            All documents
          </button>
        )}

        <DocsMenu
          label="File"
          open={menu === 'file'}
          onOpen={() => setMenu('file')}
          onClose={closeMenu}
          items={fileOptions
            .filter((opt) => isEditing || ['New', 'Import Word document (.docx)'].includes(opt.label))
            .map((opt) =>
              opt.label === 'divider'
                ? { key: 'file-div', divider: true }
                : {
                    key: opt.label,
                    label: opt.label,
                    icon: opt.icon,
                    disabled: Boolean(importing || exporting),
                    action: opt.action,
                  },
            )}
        />

        {isEditing && editor && (
          <DocsMenu
            label="Edit"
            open={menu === 'edit'}
            onOpen={() => setMenu('edit')}
            onClose={closeMenu}
            items={[
              { key: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', disabled: !editor.can().undo(), action: () => { editor.chain().focus().undo().run(); closeMenu(); } },
              { key: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', disabled: !editor.can().redo(), action: () => { editor.chain().focus().redo().run(); closeMenu(); } },
              { key: 'edit-div', divider: true },
              { key: 'selectall', label: 'Select all', shortcut: 'Ctrl+A', action: () => { editor.chain().focus().selectAll().run(); closeMenu(); } },
              { key: 'find', label: 'Find and replace…', shortcut: 'Ctrl+H', action: () => { onFindReplace?.(); closeMenu(); } },
            ]}
          />
        )}

        {isEditing && (
          <DocsMenu
            label="View"
            open={menu === 'view'}
            onOpen={() => setMenu('view')}
            onClose={closeMenu}
            items={[
              ...(onToggleRuler
                ? [{ key: 'ruler', label: 'Show ruler', checked: showRuler !== false, keepOpen: true, action: () => onToggleRuler() }]
                : []),
              ...(onToggleStatusBar
                ? [{ key: 'status', label: 'Show status bar', checked: showStatusBar !== false, keepOpen: true, action: () => onToggleStatusBar() }]
                : []),
              { key: 'view-div', divider: true },
              { key: 'full', label: 'Fullscreen', icon: <FaExpand />, action: toggleFullscreen },
            ]}
          />
        )}

        {isEditing && pageSettings && (
          <DocsMenu
            label="Page"
            open={menu === 'page'}
            onOpen={() => setMenu('page')}
            onClose={closeMenu}
            items={[
              {
                key: 'page-custom',
                custom: (
                  <>
                    <p className="text-[10px] uppercase tracking-widest text-ink-faint mb-2.5 text-center">
                      Page format
                    </p>

                    <label className="block mb-3">
                      <span className="text-[10px] uppercase tracking-widest text-ink-faint block mb-1">Page size</span>
                      <select
                        value={pageSettings.size}
                        onChange={(e) => updatePage({ size: e.target.value as PageSettings['size'] })}
                        className="w-full h-8 rounded-lg bg-surface text-xs text-ink-muted border border-[var(--border)] px-2 focus:outline-none hover:bg-soft hover:text-ink transition-colors"
                      >
                        {PAGE_SIZES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block mb-3">
                      <span className="text-[10px] uppercase tracking-widest text-ink-faint block mb-1">Orientation</span>
                      <select
                        value={pageSettings.orientation}
                        onChange={(e) => updatePage({ orientation: e.target.value as PageSettings['orientation'] })}
                        className="w-full h-8 rounded-lg bg-surface text-xs text-ink-muted border border-[var(--border)] px-2 focus:outline-none hover:bg-soft hover:text-ink transition-colors"
                      >
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-[10px] uppercase tracking-widest text-ink-faint block mb-1">Margins</span>
                      <select
                        value={pageSettings.margins}
                        onChange={(e) => updatePage({ margins: e.target.value as PageSettings['margins'] })}
                        className="w-full h-8 rounded-lg bg-surface text-xs text-ink-muted border border-[var(--border)] px-2 focus:outline-none hover:bg-soft hover:text-ink transition-colors"
                      >
                        {MARGIN_PRESETS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </label>

                    {onEditHeaderFooter && (
                      <button
                        onClick={() => { onEditHeaderFooter(); closeMenu(); }}
                        className="mt-3 w-full flex items-center justify-center gap-2 p-2 rounded-lg text-sm text-accent bg-accent-soft hover:brightness-110 transition-all"
                      >
                        Header &amp; footer…
                      </button>
                    )}

                    {onToggleRuler && (
                      <label className="mt-2 flex items-center gap-2 px-2 text-sm text-ink-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showRuler !== false}
                          onChange={onToggleRuler}
                          className="accent-[var(--accent)]"
                        />
                        Show ruler
                      </label>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}

        {isEditing && zoom !== undefined && onZoomChange && (
          <DocsMenu
            label={`${Math.round(zoom * 100)}%`}
            open={menu === 'zoom'}
            onOpen={() => setMenu('zoom')}
            onClose={closeMenu}
            items={ZOOM_PRESETS.map((z) => ({
              key: String(z),
              label: `${Math.round(z * 100)}%`,
              checked: z === zoom,
              action: () => { onZoomChange(z); closeMenu(); },
            }))}
          />
        )}

        {isEditing && (
          <DocsMenu
            label="Insert"
            open={menu === 'insert'}
            onOpen={() => setMenu('insert')}
            onClose={closeMenu}
            items={[
              { key: 'img', label: 'Insert Image', icon: <FaImage />, action: addImage },
              { key: 'tbl', label: 'Insert Table', icon: <FaTable />, action: addTable },
              { key: 'ins-div1', divider: true },
              { key: 'link', label: 'Link…', icon: <FaLink />, action: promptLink },
              ...(onEditHeaderFooter
                ? [{ key: 'hf', label: 'Header & footer…', action: () => { onEditHeaderFooter(); closeMenu(); } }]
                : []),
              { key: 'pnum', label: 'Page numbers', checked: pnChecked, keepOpen: true, action: togglePageNumbers },
              { key: 'pbreak', label: 'Page break', action: insertUserBreak },
              ...(onInsertToc ? [{ key: 'toc', label: 'Table of contents', action: () => { onInsertToc(); closeMenu(); } }] : []),
              ...(onAddComment
                ? [
                    {
                      key: 'comment',
                      label: `Comment${commentCount ? ` (${commentCount})` : ''}`,
                      action: () => {
                        onAddComment();
                        closeMenu();
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}

        {isEditing && editor && (
          <DocsMenu
            label="Format"
            open={menu === 'format'}
            onOpen={() => setMenu('format')}
            onClose={closeMenu}
            items={[
              {
                key: 'text',
                label: 'Text',
                children: [
                  { key: 'bold', label: 'Bold', shortcut: 'Ctrl+B', checked: editor.isActive('bold'), action: () => { editor.chain().focus().toggleBold().run(); closeMenu(); } },
                  { key: 'italic', label: 'Italic', shortcut: 'Ctrl+I', checked: editor.isActive('italic'), action: () => { editor.chain().focus().toggleItalic().run(); closeMenu(); } },
                  { key: 'underline', label: 'Underline', shortcut: 'Ctrl+U', checked: editor.isActive('underline'), action: () => { editor.chain().focus().toggleUnderline().run(); closeMenu(); } },
                  { key: 'strike', label: 'Strikethrough', checked: editor.isActive('strike'), action: () => { editor.chain().focus().toggleStrike().run(); closeMenu(); } },
                  { key: 'sup', label: 'Superscript', icon: <FaSuperscript />, checked: editor.isActive('superscript'), action: () => { editor.chain().focus().toggleSuperscript().run(); closeMenu(); } },
                  { key: 'sub', label: 'Subscript', icon: <FaSubscript />, checked: editor.isActive('subscript'), action: () => { editor.chain().focus().toggleSubscript().run(); closeMenu(); } },
                  { key: 'code', label: 'Inline code', checked: editor.isActive('code'), action: () => { editor.chain().focus().toggleCode().run(); closeMenu(); } },
                  { key: 'hl', label: 'Highlight', checked: editor.isActive('highlight'), action: () => { editor.chain().focus().toggleHighlight().run(); closeMenu(); } },
                ],
              },
              {
                key: 'align',
                label: 'Align',
                children: [
                  { key: 'al', label: 'Left', icon: <FaAlignLeft />, checked: editor.isActive({ textAlign: 'left' }), action: () => { editor.chain().focus().setTextAlign('left').run(); closeMenu(); } },
                  { key: 'ac', label: 'Center', icon: <FaAlignCenter />, checked: editor.isActive({ textAlign: 'center' }), action: () => { editor.chain().focus().setTextAlign('center').run(); closeMenu(); } },
                  { key: 'ar', label: 'Right', icon: <FaAlignRight />, checked: editor.isActive({ textAlign: 'right' }), action: () => { editor.chain().focus().setTextAlign('right').run(); closeMenu(); } },
                  { key: 'aj', label: 'Justify', icon: <FaAlignJustify />, checked: editor.isActive({ textAlign: 'justify' }), action: () => { editor.chain().focus().setTextAlign('justify').run(); closeMenu(); } },
                ],
              },
              {
                key: 'linesp',
                label: 'Line spacing',
                children: [
                  { key: 'lh-d', label: 'Default', checked: curLineHeight === '', action: () => setLineHeight(null) },
                  ...['1', '1.15', '1.5', '1.8', '2', '2.5'].map((v) => ({
                    key: `lh-${v}`,
                    label: v,
                    checked: curLineHeight === v,
                    action: () => setLineHeight(v),
                  })),
                ],
              },
              {
                key: 'bullets',
                label: 'Bullets & numbering',
                children: [
                  { key: 'bl', label: 'Bulleted list', icon: <FaListUl />, checked: editor.isActive('bulletList'), action: () => { editor.chain().focus().toggleBulletList().run(); closeMenu(); } },
                  { key: 'nl', label: 'Numbered list', icon: <FaListOl />, checked: editor.isActive('orderedList'), action: () => { editor.chain().focus().toggleOrderedList().run(); closeMenu(); } },
                  { key: 'cl', label: 'Checklist', checked: editor.isActive('taskList'), action: () => { editor.chain().focus().toggleTaskList().run(); closeMenu(); } },
                ],
              },
              {
                key: 'paraset',
                label: 'Paragraph settings…',
                custom: <ParagraphMenu editor={editor} onClose={closeMenu} />,
              },
              { key: 'fmt-div', divider: true },
              { key: 'clear', label: 'Clear formatting', icon: <FaEraser />, action: clearFormatting },
            ]}
          />
        )}

        {isEditing && (
          <DocsMenu
            label="Tools"
            open={menu === 'tools'}
            onOpen={() => setMenu('tools')}
            onClose={closeMenu}
            items={[
              { key: 'wc', label: 'Word count…', action: () => { onWordCount?.(); closeMenu(); } },
              { key: 'find', label: 'Find and replace…', shortcut: 'Ctrl+H', action: () => { onFindReplace?.(); closeMenu(); } },
              ...(onVersionHistory ? [{ key: 'vh', label: 'Version history', action: () => { onVersionHistory(); closeMenu(); } }] : []),
            ]}
          />
        )}

        {isEditing && (
          <DocsMenu
            label="Help"
            open={menu === 'help'}
            onOpen={() => setMenu('help')}
            onClose={closeMenu}
            items={[
              { key: 'keys', label: 'Keyboard shortcuts', action: () => { onHelp?.(); closeMenu(); } },
              { key: 'about', label: 'About BDoc', action: () => { onHelp?.(); closeMenu(); } },
            ]}
          />
        )}
      </div>
    </nav>
  );
}