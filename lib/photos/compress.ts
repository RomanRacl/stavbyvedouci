/**
 * Zmenší fotku z telefonu před uložením: delší strana max. `maxSide` px, JPEG.
 * Fotka z mobilu má běžně 3–8 MB, po zmenšení kolem 250–400 kB – to šetří data
 * dělníka v terénu i úložiště. Orientaci z EXIF respektuje `imageOrientation`.
 */
export async function compressImage(
  file: File,
  maxSide = 1600,
  quality = 0.8,
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

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Fotku se nepodařilo uložit.'))), 'image/jpeg', quality),
  );
  return { blob, width, height };
}
