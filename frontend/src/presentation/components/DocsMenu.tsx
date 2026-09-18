import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DocsMenuItem {
  key: string;
  label?: string;
  icon?: ReactNode;
  /** e.g. "Ctrl+Z" — right-aligned hint */
  shortcut?: string;
  /** toggle check mark */
  checked?: boolean;
  disabled?: boolean;
  divider?: boolean;
  action?: () => void;
  /** when true, the menu stays open after the action (checkbox-style toggles) */
  keepOpen?: boolean;
  /** one-level nested submenu (hover to open) */
  children?: DocsMenuItem[];
  /** raw content (complex controls like selects) */
  custom?: ReactNode;
}

interface DocsMenuProps {
  label: string;
  items: DocsMenuItem[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  buttonClassName?: string;
  panelClassName?: string;
}

function ItemRow({
  item,
  onAction,
}: {
  item: DocsMenuItem;
  onAction: (item: DocsMenuItem) => void;
}) {
  if (item.divider) {
    return <div className="my-1 border-t border-[var(--border)]" />;
  }
  if (item.custom) {
    return <div className="px-1 py-1">{item.custom}</div>;
  }
  const row = (
    <button
      key={item.key}
      onClick={() => onAction(item)}
      disabled={item.disabled}
      className="w-full flex items-center gap-3 p-2.5 rounded-lg text-sm text-ink-muted hover:text-ink hover:bg-soft transition-colors disabled:opacity-60"
    >
      <span className="w-5 flex items-center justify-center text-accent">{item.icon}</span>
      <span className="flex-1 text-left truncate">{item.label}</span>
      {item.checked && (
        <span aria-hidden className="text-accent text-xs">
          ✓
        </span>
      )}
      {item.shortcut && <span className="text-xs text-ink-faint">{item.shortcut}</span>}
      {item.children && <span aria-hidden className="text-xs text-ink-faint">▶</span>}
    </button>
  );
  if (!item.children) return row;
  return (
    <div key={item.key} className="relative group/sub">
      {row}
      <div className="absolute left-full top-0 ml-1 w-56 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] p-1.5 z-50 hidden group-hover/sub:block">
        {item.children.map((sub) => (
          <ItemRow key={sub.key} item={sub} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

/**
 * Google-Docs-style text menu: label button + dropdown panel. Controlled
 * open state lets the navbar keep menus exclusive. The panel renders in a
 * portal (fixed to the button rect) so it escapes the scrollable menu row —
 * absolutely-positioned panels would be clipped by it.
 */
export default function DocsMenu({ label, items, open, onOpen, onClose, buttonClassName, panelClassName }: DocsMenuProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 272)),
      top: r.bottom + 8,
    });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open ]);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={() => (open ? onClose() : onOpen())}
        className={
          buttonClassName ??
          `px-2 py-1 rounded-md text-sm whitespace-nowrap transition-colors ${
            open ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:text-ink hover:bg-soft'
          }`
        }
      >
        {label}
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[290]" onClick={onClose} />
            <div
              className={`fixed w-64 rounded-xl bg-raised border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden animate-in fade-in zoom-in duration-150 z-[300] ${panelClassName ?? ''}`}
              style={{ left: pos.left, top: pos.top }}
            >
              <div className="p-1.5">
                {items.map((item) => (
                  <ItemRow
                    key={item.key}
                    item={item}
                    onAction={(it) => {
                      if (it.children) return;
                      it.action?.();
                      if (!it.keepOpen) onClose();
                    }}
                  />
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
