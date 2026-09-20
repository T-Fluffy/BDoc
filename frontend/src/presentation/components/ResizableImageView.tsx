import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useCallback, useRef, useState } from 'react';
import { FaAlignCenter, FaAlignLeft, FaAlignRight } from 'react-icons/fa';

const SIZES = ['25%', '50%', '75%', '100%'] as const;

/**
 * Resizable image with drag handles and a small bubble for align + size.
 * Width is stored as a CSS percentage string (e.g. "50%") in the node's
 * `width` attr; `align` controls the wrapper's justification.
 */
export default function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const width: string | null = (node.attrs.width as string | null) ?? null;
  const align: string | null = (node.attrs.align as string | null) ?? null;
  const src = (node.attrs.src as string) ?? '';

  const setWidth = useCallback(
    (w: string | null) => {
      updateAttributes({ width: w });
    },
    [updateAttributes],
  );

  const setAlign = useCallback(
    (a: string | null) => {
      updateAttributes({ align: a });
    },
    [updateAttributes],
  );

  const [altOpen, setAltOpen] = useState(false);
  const [altDraft, setAltDraft] = useState('');
  const openAlt = useCallback(() => {
    setAltDraft((node.attrs.alt as string) ?? '');
    setAltOpen(true);
  }, [node.attrs.alt]);

  const onHandleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const wrapper = (e.currentTarget.parentElement as HTMLElement) ?? null;
      if (!wrapper) return;
      const startX = e.clientX;
      const startW = wrapper.getBoundingClientRect().width;
      const pageW = wrapper.parentElement?.getBoundingClientRect().width ?? startW;
      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX;
        const next = Math.min(100, Math.max(10, ((startW + dx) / pageW) * 100));
        setWidth(`${Math.round(next)}%`);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      e.preventDefault();
    },
    [setWidth],
  );

  // Wrapper justification based on align.
  const justify =
    align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'center';

  return (
    <NodeViewWrapper className="bdoc-image" style={{ display: 'flex', justifyContent: justify } as React.CSSProperties}>
      <div
        className={`bdoc-image-wrap ${selected ? 'is-selected' : ''}`}
        style={{ width: width ?? '50%', maxWidth: '100%', position: 'relative' }}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          ref={imgRef}
          src={src}
          alt={node.attrs.alt ?? ''}
          title={node.attrs.title ?? ''}
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }}
          draggable={false}
        />
        {selected && (
          <>
            <div className="bdoc-image-handle left" onPointerDown={onHandleDown} />
            <div className="bdoc-image-handle right" onPointerDown={onHandleDown} />
            <div className="bdoc-image-bubble no-print">
              <div className="bdoc-image-bubble-row">
                <button
                  type="button"
                  title="Align left"
                  className={align === 'left' ? 'is-active' : ''}
                  onClick={() => setAlign(align === 'left' ? null : 'left')}
                >
                  <FaAlignLeft size={12} />
                </button>
                <button
                  type="button"
                  title="Align center"
                  className={!align || align === 'center' ? 'is-active' : ''}
                  onClick={() => setAlign('center')}
                >
                  <FaAlignCenter size={12} />
                </button>
                <button
                  type="button"
                  title="Align right"
                  className={align === 'right' ? 'is-active' : ''}
                  onClick={() => setAlign('right')}
                >
                  <FaAlignRight size={12} />
                </button>
                <button type="button" title="Alt text" onClick={openAlt}>
                  Alt
                </button>
              </div>
              <div className="bdoc-image-bubble-row">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    title={`Width ${s}`}
                    className={width === s ? 'is-active' : ''}
                    onClick={() => setWidth(s)}
                  >
                    {s}
                  </button>
                ))}
                <button type="button" title="Original size" className={!width ? 'is-active' : ''} onClick={() => setWidth(null)}>
                  •
                </button>
              </div>
              {altOpen && (
                <div className="bdoc-image-alt-row">
                  <input
                    autoFocus
                    value={altDraft}
                    onChange={(e) => setAltDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        updateAttributes({ alt: altDraft.trim() || null });
                        setAltOpen(false);
                      } else if (e.key === 'Escape') setAltOpen(false);
                    }}
                    placeholder="Alt text"
                    className="bdoc-image-alt-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      updateAttributes({ alt: altDraft.trim() || null });
                      setAltOpen(false);
                    }}
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
