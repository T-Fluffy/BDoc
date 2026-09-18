import { useEffect } from 'react';
import type { HeaderFooterSettings } from '../../domain/models/PageSettings';

interface HeaderFooterDialogProps {
  settings: HeaderFooterSettings;
  onChange: (next: HeaderFooterSettings) => void;
  onClose: () => void;
}

const inputCls =
  'w-full rounded-lg bg-surface text-sm text-ink border border-[var(--border)] px-2.5 py-1.5 focus:outline-none focus:border-[var(--border-strong)] placeholder:text-ink-faint resize-y';
const labelCls = 'text-[10px] uppercase tracking-widest text-ink-faint block mb-1';

function VariantInputs({
  title,
  value,
  showFirst,
  showEven,
  onPatch,
}: {
  title: string;
  value: { default: string; first: string; even: string };
  showFirst: boolean;
  showEven: boolean;
  onPatch: (patch: Partial<{ default: string; first: string; even: string }>) => void;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-ink mb-2">{title}</h3>
      <div className="space-y-2.5">
        <label className="block">
          <span className={labelCls}>{showFirst || showEven ? 'Default pages' : 'Text'}</span>
          <textarea
            rows={2}
            value={value.default}
            placeholder={`No ${title.toLowerCase()} — leave empty for none`}
            onChange={(e) => onPatch({ default: e.target.value })}
            className={inputCls}
          />
        </label>
        {showFirst && (
          <label className="block">
            <span className={labelCls}>First page</span>
            <textarea
              rows={2}
              value={value.first}
              placeholder="Falls back to the default text when empty"
              onChange={(e) => onPatch({ first: e.target.value })}
              className={inputCls}
            />
          </label>
        )}
        {showEven && (
          <label className="block">
            <span className={labelCls}>Even pages</span>
            <textarea
              rows={2}
              value={value.even}
              placeholder="Falls back to the default text when empty"
              onChange={(e) => onPatch({ even: e.target.value })}
              className={inputCls}
            />
          </label>
        )}
      </div>
    </section>
  );
}

export default function HeaderFooterDialog({ settings, onChange, onClose }: HeaderFooterDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (patch: Partial<HeaderFooterSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Header and footer"
        className="w-[min(560px,92vw)] max-h-[85vh] overflow-auto rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">Header &amp; footer</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-contrast hover:bg-accent-hover transition-colors"
          >
            Done
          </button>
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
              <input
                type="checkbox"
                checked={settings.differentFirstPage}
                onChange={(e) => set({ differentFirstPage: e.target.checked })}
                className="accent-[var(--accent)]"
              />
              Different first page
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
              <input
                type="checkbox"
                checked={settings.differentOddEven}
                onChange={(e) => set({ differentOddEven: e.target.checked })}
                className="accent-[var(--accent)]"
              />
              Different odd &amp; even pages
            </label>
          </div>

          <VariantInputs
            title="Header"
            value={settings.header}
            showFirst={settings.differentFirstPage}
            showEven={settings.differentOddEven}
            onPatch={(patch) => set({ header: { ...settings.header, ...patch } })}
          />

          <VariantInputs
            title="Footer"
            value={settings.footer}
            showFirst={settings.differentFirstPage}
            showEven={settings.differentOddEven}
            onPatch={(patch) => set({ footer: { ...settings.footer, ...patch } })}
          />

          <section>
            <h3 className="text-xs font-semibold text-ink mb-2">Page numbers</h3>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.pageNumbersEnabled}
                  onChange={(e) => set({ pageNumbersEnabled: e.target.checked })}
                  className="accent-[var(--accent)]"
                />
                Show “Page X of Y” in the footer
              </label>
              {settings.pageNumbersEnabled && (
                <label className="flex items-center gap-2 text-sm text-ink-muted">
                  <span className="text-[10px] uppercase tracking-widest text-ink-faint">Align</span>
                  <select
                    value={settings.pageNumberAlign}
                    onChange={(e) =>
                      set({ pageNumberAlign: e.target.value as HeaderFooterSettings['pageNumberAlign'] })
                    }
                    className="h-8 rounded-lg bg-surface text-xs text-ink-muted border border-[var(--border)] px-2 focus:outline-none"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              )}
            </div>
          </section>

          <p className="text-xs text-ink-faint">
            Double-click a header or footer zone on any page to reopen this dialog. Saved with the document.
          </p>
        </div>
      </div>
    </div>
  );
}
