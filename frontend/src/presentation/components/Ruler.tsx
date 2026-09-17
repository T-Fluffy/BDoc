import { useRef } from 'react';

interface RulerProps {
  pageWidthMm: number;
  marginMm: number;
  onMarginChange: (mm: number) => void;
}

/**
 * Word-like horizontal ruler: margin shading, cm ticks and draggable margin
 * handles. Positions are fractions of the page width, so they stay truthful
 * at any zoom level. Dragging either handle sets the uniform page margin.
 */
export default function Ruler({ pageWidthMm, marginMm, onMarginChange }: RulerProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragSide = useRef<'left' | 'right' | null>(null);

  const pct = (mm: number) => `${(mm / pageWidthMm) * 100}%`;
  const mmFromClientX = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return marginMm;
    return ((clientX - r.left) / r.width) * pageWidthMm;
  };

  const onPointerDown = (side: 'left' | 'right') => (e: React.PointerEvent<HTMLDivElement>) => {
    dragSide.current = side;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragSide.current) return;
    const raw =
      dragSide.current === 'left' ? mmFromClientX(e.clientX) : pageWidthMm - mmFromClientX(e.clientX);
    const clamped = Math.min(pageWidthMm / 2, Math.max(0, raw));
    onMarginChange(Math.round(clamped * 2) / 2);
  };
  const endDrag = () => {
    dragSide.current = null;
  };

  const minorStep = pct(2);
  const mediumStep = pct(10);
  const labels: number[] = [];
  for (let m = 10; m < pageWidthMm; m += 10) labels.push(m);

  return (
    <div ref={barRef} className="bdoc-ruler no-print" role="slider" aria-label="Page margins" aria-valuenow={marginMm}>
      <div className="bdoc-ruler-shade" style={{ left: 0, width: pct(marginMm) }} />
      <div className="bdoc-ruler-shade" style={{ right: 0, width: pct(marginMm) }} />
      <div
        className="bdoc-ruler-ticks"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, var(--ruler-tick) 0 1px, transparent 1px ${mediumStep}), repeating-linear-gradient(90deg, var(--ruler-tick) 0 1px, transparent 1px ${minorStep})`,
          backgroundSize: `100% 9px, 100% 5px`,
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'bottom left',
        }}
      />
      {labels.map((m) => (
        <span key={m} className="bdoc-ruler-label" style={{ left: pct(m) }}>
          {m / 10}
        </span>
      ))}
      <div
        className="bdoc-ruler-handle"
        style={{ left: pct(marginMm) }}
        title={`Left margin: ${marginMm.toFixed(1)} mm — drag to change`}
        onPointerDown={onPointerDown('left')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div
        className="bdoc-ruler-handle"
        style={{ left: `calc(100% - ${pct(marginMm)})` }}
        title={`Right margin: ${marginMm.toFixed(1)} mm — drag to change`}
        onPointerDown={onPointerDown('right')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}
