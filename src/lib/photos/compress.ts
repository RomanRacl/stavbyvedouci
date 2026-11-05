/**
 * Zmenší fotku z telefonu před uložením: delší strana max. `maxSide` px, JPEG.
 * Fotka z mobilu má běžně 3–8 MB, po zmenšení kolem 250–400 kB – to šetří data
 * dělníka v terénu i úložiště. Orientaci z EXIF respektuje `imageOrientation`.
 */
export async function compressImage(
  file: File,
  maxSide = 1600,
  quality = 0.8,
  stamp: string[] | null = null,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Prohlížeč neumí zpracovat obrázek.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  if (stamp?.length) drawStamp(ctx, width, height, stamp);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Fotku se nepodařilo uložit.'))), 'image/jpeg', quality),
  );
  return { blob, width, height };
}

/**
 * Razítko v levém dolním rohu: kód zakázky, adresa, datum a čas, poloha.
 * Je přímo v obrázku, takže zůstane i po přeposlání fotky zákazníkovi nebo pojišťovně.
 */
export function drawStamp(ctx: CanvasRenderingContext2D, width: number, height: number, lines: string[]) {
  const size = Math.max(14, Math.round(Math.min(width, height) * 0.028));
  const pad = Math.round(size * 0.6);
  ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'top';
  const maxW = width - pad * 4;
  const fit = (t: string) => {
    if (ctx.measureText(t).width <= maxW) return t;
    let s = t;
    while (s.length > 4 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s}…`;
  };
  const rows = lines.map(fit);
  const lh = Math.round(size * 1.3);
  const boxW = Math.min(width - pad * 2, Math.max(...rows.map((r) => ctx.measureText(r).width)) + pad * 2);
  const boxH = rows.length * lh + pad * 2 - (lh - size);
  const x = pad;
  const y = height - boxH - pad;
  ctx.fillStyle = 'rgba(11, 16, 21, 0.62)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, boxW, boxH, Math.round(size * 0.4));
  else ctx.rect(x, y, boxW, boxH);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  rows.forEach((r, i) => ctx.fillText(r, x + pad, y + pad + i * lh));
}
