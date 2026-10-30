'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Images } from 'lucide-react';
import { useRef, useState } from 'react';
import { PhotoImg } from '@/features/photos/PhotoThumb';
import { PhotoViewer } from '@/features/photos/PhotoViewer';
import { TagBadge } from '@/features/photos/TagBadge';
import type { JobPhoto, Member, PhotoTag } from '@/types/firestore';
import { buzz } from '../hooks/useWorkerData';

interface Props {
  photos: JobPhoto[];
  members: Member[];
  myUid: string;
  onAdd: (files: File[]) => Promise<number>;
  onDelete: (photo: JobPhoto) => void;
  onTag: (photo: JobPhoto, tag: PhotoTag | null) => void;
}

/**
 * Fotky k zakázce. „Vyfotit“ otevře rovnou zadní fotoaparát (capture="environment"),
 * „Z galerie“ dovolí vybrat víc hotových fotek najednou.
 */
export function WorkerPhotos({ photos, members, myUid, onAdd, onDelete, onTag }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);

  const handle = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    buzz();
    setPending((n) => n + files.length);
    try {
      await onAdd(files);
    } finally {
      setPending((n) => Math.max(0, n - files.length));
    }
  };

  const btn =
    'flex h-14 items-center justify-center gap-2 rounded-xl text-base font-semibold transition active:scale-[0.98]';

  return (
    <section className="mt-8" aria-labelledby="photos-h">
      <div className="flex items-baseline justify-between">
        <h2 id="photos-h" className="text-base font-semibold text-ink">
          Fotky
        </h2>
        {photos.length > 0 && <span className="text-sm text-ink-3 tabular-nums">{photos.length}</span>}
      </div>

      {(photos.length > 0 || pending > 0) && (
        <ul className="mt-2 grid grid-cols-3 gap-1.5">
          <AnimatePresence initial={false}>
            {Array.from({ length: pending }, (_, i) => (
              <motion.li key={`pending-${i}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="aspect-square animate-pulse rounded-xl bg-line" aria-label="Ukládám fotku" />
            ))}
            {photos.map((p, i) => (
              <motion.li key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                <button type="button" onClick={() => setViewer(i)} className="relative block aspect-square w-full overflow-hidden rounded-xl active:opacity-80">
                  <PhotoImg photo={p} alt={`Fotka ${i + 1}`} className="size-full" />
                  <TagBadge tag={p.tag} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => cameraRef.current?.click()} className={`${btn} bg-ink text-white`}>
          <Camera className="size-5" /> Vyfotit
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()} className={`${btn} border-2 border-ink bg-surface text-ink`}>
          <Images className="size-5" /> Z galerie
        </button>
      </div>

      {/* Skrytá pole; hodnota se po výběru maže, aby šla stejná fotka vybrat znovu. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = '';
        }}
      />

      <PhotoViewer
        photos={photos}
        index={viewer}
        members={members}
        onIndex={setViewer}
        canDelete={(p) => p.workerId === myUid}
        onDelete={onDelete}
        onTag={onTag}
      />
    </section>
  );
}
