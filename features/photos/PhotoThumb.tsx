'use client';

import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { photoUrl } from '@/lib/photos/photoBlobs';
import type { JobPhoto } from '@/types/firestore';

/** Načte obrázek fotky (zatím z IndexedDB, po Firebase ze Storage) a do té doby ukazuje skeleton. */
export function usePhotoSrc(photo: JobPhoto) {
  const [src, setSrc] = useState<string | null | undefined>(undefined); // undefined = načítá se
  useEffect(() => {
    let alive = true;
    photoUrl(photo.id).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [photo.id]);
  return src;
}

export function PhotoImg({ photo, className, alt }: { photo: JobPhoto; className?: string; alt: string }) {
  const src = usePhotoSrc(photo);
  if (src === undefined) return <span className={`block animate-pulse bg-line ${className ?? ''}`} aria-busy="true" />;
  if (src === null)
    return (
      <span className={`grid place-items-center bg-concrete text-ink-3 ${className ?? ''}`} title="Fotka je uložená v jiném zařízení">
        <ImageOff className="size-5" aria-label="Fotka není v tomto zařízení" />
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- blob URL, next/image ji neumí optimalizovat
  return <img src={src} alt={alt} draggable={false} className={`object-cover ${className ?? ''}`} />;
}
