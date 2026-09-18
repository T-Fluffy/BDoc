import { useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import {
  FaBars,
  FaCog,
  FaFileAlt,
  FaFileImport,
  FaFileWord,
  FaImage,
  FaMoon,
  FaPlus,
  FaPrint,
  FaSignOutAlt,
  FaSpinner,
  FaSun,
  FaTable,
  FaTimesCircle,
  FaUserCircle,
} from 'react-icons/fa';
import { useTheme } from '../theme/useTheme';
import { useAuth } from '../context/AuthContext';
import {
  PAGE_SIZES,
  MARGIN_PRESETS,
  ZOOM_PRESETS,
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
  title?: string;
  onTitleChange?: (value: string) => void;
  titleStatus?: ReactNode;
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
  title,
  onTitleChange,
  titleStatus,
}: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, setMode } = useTheme();
  const { logout } = useAuth();
  const [menu, setMenu] = useState<'insert' | 'file' | 'page' | 'user' | 'zoom' | null>(null);

  const updatePage = (patch: Partial<PageSettings>) => {
    if (pageSettings && onPageSettingsChange) {
      onPageSettingsChange({ ...pageSettings, ...patch });
    }
  };

  const isEditing = location.pathname.includes('/editor/');

  const closeMenu = () => setMenu(null);

  const addImage = () => {
    const url = window.prompt('Enter image URL');
    if (url && editor) editor.chain().focus().setImage({ src: url }).run();
    closeMenu();
  };

  const addTable = () => {
    if (editor) editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    closeMenu();
  };

  const insertOptions = [
    { label: 'Insert Image', icon: <FaImage />, action: addImage },
    { label: 'Insert Table', icon: <FaTable />, action: addTable },
  ];

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

  // Docs-style text menu button (shared by the menu row).
  const menuBtn = (active: boolean) =>
    `px-2 py-1 rounded-md text-sm whitespace-nowrap transition-colors ${
      active ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:text-ink hover:bg-soft'
    }`;

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

        <div className="relative">
          <button onClick={() => setMenu(menu === 'file' ? null : 'file')} className={menuBtn(menu === 'file')}>
            File
          </button>

            {menu === 'file' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute left-0 mt-2 w-64 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden animate-in fade-in zoom-in duration-150 z-50">
                  <div className="p-1.5">
                    {fileOptions.map((opt) => {
                      if (!isEditing && !['New', 'Import Word document (.docx)'].includes(opt.label)) return null;
                      return opt.label === 'divider' ? (
                        <div key="divider" className="my-1 border-t border-[var(--border)]" />
                      ) : (
                        <button
                          key={opt.label}
                          onClick={opt.action}
                          disabled={Boolean(importing || exporting)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-lg text-sm text-ink-muted hover:text-ink hover:bg-soft transition-colors disabled:opacity-60"
                        >
                          <span className="text-accent">{opt.icon}</span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

        {isEditing && pageSettings && (
          <div className="relative">
            <button onClick={() => setMenu(menu === 'page' ? null : 'page')} className={menuBtn(menu === 'page')}>
              Page
            </button>

            {menu === 'page' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute left-0 mt-2 w-56 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] p-3 z-50 animate-in fade-in zoom-in duration-150">
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
                </div>
              </>
            )}
          </div>
        )}

        {isEditing && zoom !== undefined && onZoomChange && (
          <div className="relative">
            <button onClick={() => setMenu(menu === 'zoom' ? null : 'zoom')} className={menuBtn(menu === 'zoom')}>
              {Math.round(zoom * 100)}%
            </button>

            {menu === 'zoom' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute left-0 mt-2 w-40 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden animate-in fade-in zoom-in duration-150 z-50">
                  <div className="p-1.5">
                    {ZOOM_PRESETS.map((z) => (
                      <button
                        key={z}
                        onClick={() => { onZoomChange(z); closeMenu(); }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg text-sm transition-colors ${
                          z === zoom
                            ? 'text-accent bg-accent-soft'
                            : 'text-ink-muted hover:text-ink hover:bg-soft'
                        }`}
                      >
                        {Math.round(z * 100)}%
                        {z === zoom && <span aria-hidden>✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {isEditing && (
          <div className="relative">
            <button onClick={() => setMenu(menu === 'insert' ? null : 'insert')} className={menuBtn(menu === 'insert')}>
              Insert
            </button>

            {menu === 'insert' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute left-0 mt-2 w-48 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden animate-in fade-in zoom-in duration-150 z-50">
                  <div className="p-1.5">
                    {insertOptions.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={opt.action}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg text-sm text-ink-muted hover:text-ink hover:bg-soft transition-colors"
                      >
                        <span className="text-accent">{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}