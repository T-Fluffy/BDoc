import { FaMoon, FaSun, FaTimes } from 'react-icons/fa';
import { ACCENT_PRESETS, type EditorFont, type ThemeMode } from '../theme/themeTypes';
import { useTheme } from '../theme/useTheme';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FONT_OPTIONS: { label: string; value: EditorFont }[] = [
  { label: 'Sans', value: 'sans' },
  { label: 'Serif', value: 'serif' },
  { label: 'Mono', value: 'mono' },
];

export default function SettingsDrawer({ open, onClose }: Props) {
  const { mode, accent, font, setMode, setAccent, setFont } = useTheme();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-surface border-l border-[var(--border)] shadow-[var(--shadow-lg)] flex flex-col animate-in slide-in-from-right duration-300">
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold tracking-wide text-ink">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-soft transition-colors"
            aria-label="Close settings"
          >
            <FaTimes />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* Appearance */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-3">
              Appearance
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('dark' as ThemeMode)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-all ${
                  mode === 'dark'
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-[var(--border)] text-ink-muted hover:bg-soft'
                }`}
              >
                <FaMoon /> Dark
              </button>
              <button
                onClick={() => setMode('light' as ThemeMode)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-all ${
                  mode === 'light'
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-[var(--border)] text-ink-muted hover:bg-soft'
                }`}
              >
                <FaSun /> Light
              </button>
            </div>
          </section>

          {/* Accent color */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-3">
              Accent color
            </h3>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c.value}
                  title={c.name}
                  onClick={() => setAccent(c.value)}
                  className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                    accent === c.value ? 'ring-2 ring-offset-2 ring-offset-surface' : ''
                  }`}
                  style={{ backgroundColor: c.value, boxShadow: accent === c.value ? `0 0 0 2px var(--surface), 0 0 0 4px ${c.value}` : undefined }}
                  aria-label={c.name}
                />
              ))}
              <label
                className="w-8 h-8 rounded-full bg-soft border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-soft transition-colors"
                title="Custom color"
              >
                <span className="text-ink-muted text-xs font-bold">+</span>
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="sr-only"
                />
              </label>
            </div>
          </section>

          {/* Editor font */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-3">
              Editor font
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFont(f.value)}
                  className={`px-4 py-2.5 rounded-xl border text-sm transition-all ${
                    font === f.value
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-[var(--border)] text-ink-muted hover:bg-soft'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}