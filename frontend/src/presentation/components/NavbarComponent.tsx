import { useState } from 'react';
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
}: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, setMode } = useTheme();
  const [menu, setMenu] = useState<'insert' | 'file' | 'user' | null>(null);

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
    localStorage.removeItem('bdoc-auth');
    navigate('/login');
  };

  return (
    <nav className="h-14 shrink-0 bg-canvas/80 backdrop-blur-xl border-b border-[var(--border)] px-4 flex items-center justify-between relative z-[100] no-print">
      <div className="flex items-center gap-2">
        {isEditing && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-soft transition-colors"
            aria-label="Toggle sidebar"
          >
            <FaBars />
          </button>
        )}

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 group"
        >
          <span className="w-7 h-7 bg-gradient-to-br from-accent to-violet-500 rounded-lg shadow-[0_0_20px_var(--accent-soft)] group-hover:scale-110 transition-transform flex items-center justify-center">
            <FaFileAlt size={13} className="text-accent-contrast" />
          </span>
          <span className="font-bold tracking-[0.2em] text-sm uppercase text-ink">BDoc</span>
        </button>

        <span className="h-5 w-px bg-[var(--border)] mx-2 hidden sm:block" />

        {isEditing && (
          <button
            onClick={() => navigate('/')}
            className="text-sm text-ink-muted hover:text-ink transition-colors hidden sm:block"
          >
            All documents
          </button>
        )}

        {isEditing && (
          <div className="relative">
            <button
              onClick={() => setMenu(menu === 'file' ? null : 'file')}
              className={`ml-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all border ${
                menu === 'file'
                  ? 'bg-accent-soft text-accent border-[var(--border-strong)]'
                  : 'bg-soft/60 text-ink-muted hover:text-ink border-[var(--border)]'
              }`}
            >
              File
            </button>

            {menu === 'file' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute left-0 mt-2 w-64 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden animate-in fade-in zoom-in duration-150 z-50">
                  <div className="p-1.5">
                    {fileOptions.map((opt) =>
                      opt.label === 'divider' ? (
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
                      ),
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {isEditing && (
          <div className="relative">
            <button
              onClick={() => setMenu(menu === 'insert' ? null : 'insert')}
              className={`ml-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all border ${
                menu === 'insert'
                  ? 'bg-accent-soft text-accent border-[var(--border-strong)]'
                  : 'bg-soft/60 text-ink-muted hover:text-ink border-[var(--border)]'
              }`}
            >
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

      <div className="flex items-center gap-1">
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
    </nav>
  );
}