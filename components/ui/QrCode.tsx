'use client';

import { useMemo } from 'react';
import { encodeQr, qrPath } from '@/lib/qr';

/** QR kód jako SVG – ostrý v tisku i na displeji. Vždy černá na bílé, aby šel naskenovat i v tmavém režimu. */
export function QrCode({ value, size = 128, label }: { value: string; size?: number; label: string }) {
  const m = useMemo(() => encodeQr(value), [value]);
  const dim = m.size + 8;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${dim} ${dim}`} role="img" aria-label={label} shapeRendering="crispEdges" className="block bg-[#fff]">
      <rect width={dim} height={dim} fill="#fff" />
      <path d={qrPath(m)} fill="#000" />
    </svg>
  );
}
