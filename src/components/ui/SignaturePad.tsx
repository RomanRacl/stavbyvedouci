'use client';

import { Eraser } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';

interface Props {
  /** Volá se po každém tahu s PNG data URL, nebo null po smazání. */
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

/**
 * Podpis prstem nebo myší (Pointer Events). Plátno se kreslí ve vyšším rozlišení
 * podle devicePixelRatio, aby byl podpis ostrý i na telefonu.
 */
export function SignaturePad({ onChange, height = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  const setup = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const { width } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#16202a';
  }, [height]);

  useEffect(() => {
    setup();
  }, [setup]);

  const point = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext('2d');
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#16202a';
      ctx.fill();
    }
  };

  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    const p = point(e);
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(canvasRef.current?.toDataURL('image/png') ?? null);
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.restore();
    }
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-line bg-[#fff]">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: 'none' }}
          className="block w-full cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label="Plocha pro podpis"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-base text-ink-3">Podepište se prstem</span>
        )}
        <span className="pointer-events-none absolute inset-x-6 bottom-8 h-px bg-line" aria-hidden />
      </div>
      {!empty && (
        <button type="button" onClick={clear} className="mt-2 inline-flex h-11 items-center gap-2 rounded-lg px-3 text-base font-medium text-ink-2 active:bg-concrete">
          <Eraser className="size-4" /> Smazat a podepsat znovu
        </button>
      )}
    </div>
  );
}
