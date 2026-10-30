'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PHOTO_TAGS } from '@/lib/jobDefaults';
import type { JobPhoto, Member, PhotoTag } from '@/types/firestore';
import { PhotoImg } from './PhotoThumb';

interface Props {
  photos: JobPhoto[];
  index: number | null;
  members: Member[];
  onIndex: (i: number | null) => void;
  /** Kdo smí fotku smazat (dělník své, kancelář všechny). Bez callbacku se mazání neukáže. */
  canDelete?: (p: JobPhoto) => boolean;
  onDelete?: (p: JobPhoto) => void;
  /** Štítek fotky (před / během / po / závada). Bez callbacku se štítek jen zobrazí. */
  onTag?: (p: JobPhoto, tag: PhotoTag | null) => void;
}

/** Celoobrazovkový prohlížeč: šipky / Esc na klávesnici, tah do stran na mobilu. */
export function PhotoViewer({ photos, index, members, onIndex, canDelete, onDelete, onTag }: Props) {
  const [dir, setDir] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const photo = index === null ? null : photos[index];

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next < 0 || next >= photos.length) return;
      setDir(delta);
      setConfirm(false);
      onIndex(next);
    },
    [index, photos.length, onIndex],
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIndex(null);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, onIndex]);

  // Smazání poslední fotky / posun indexu mimo rozsah zavře prohlížeč.
  useEffect(() => {
    if (index !== null && index >= photos.length) onIndex(photos.length ? photos.length - 1 : null);
  }, [index, photos.length, onIndex]);

  if (typeof document === 'undefined') return null;
  const author = photo ? members.find((m) => m.uid === photo.workerId)?.displayName ?? 'Neznámý pracovník' : '';
  const deletable = photo && onDelete && canDelete?.(photo);

  return createPortal(
    <AnimatePresence>
      {photo && index !== null && (
        <motion.div
          className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-[#fff]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Fotka ze zakázky"
        >
          <header className="flex items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{author}</p>
              <p className="text-sm text-[#fff]/60 tabular-nums">
                {photo.takenAt.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {photos.length > 1 && `, ${index + 1} z ${photos.length}`}
              </p>
            </div>
            {deletable &&
              (confirm ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirm(false);
                    onDelete(photo);
                  }}
                  className="h-11 rounded-xl bg-crit px-4 text-sm font-semibold"
                >
                  Opravdu smazat
                </button>
              ) : (
                <button type="button" onClick={() => setConfirm(true)} aria-label="Smazat fotku" className="grid size-11 place-items-center rounded-xl hover:bg-[#fff]/10">
                  <Trash2 className="size-5" />
                </button>
              ))}
            <button type="button" onClick={() => onIndex(null)} aria-label="Zavřít" className="grid size-11 place-items-center rounded-xl hover:bg-[#fff]/10">
              <X className="size-6" />
            </button>
          </header>

          <div className="relative flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div
                key={photo.id}
                custom={dir}
                initial={{ opacity: 0, x: dir * 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -60 }}
                transition={{ duration: 0.22 }}
                drag={photos.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5}
                onDragEnd={(_: unknown, info: { offset: { x: number } }) => {
                  if (info.offset.x < -80) go(1);
                  else if (info.offset.x > 80) go(-1);
                }}
                className="absolute inset-0 flex items-center justify-center p-2"
              >
                <PhotoImg photo={photo} alt={`Fotka od ${author}`} className="max-h-full max-w-full !object-contain" />
              </motion.div>
            </AnimatePresence>

            {index > 0 && (
              <button type="button" onClick={() => go(-1)} aria-label="Předchozí fotka" className="absolute top-1/2 left-2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70 sm:grid">
                <ChevronLeft className="size-6" />
              </button>
            )}
            {index < photos.length - 1 && (
              <button type="button" onClick={() => go(1)} aria-label="Další fotka" className="absolute top-1/2 right-2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70 sm:grid">
                <ChevronRight className="size-6" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
            {onTag
              ? PHOTO_TAGS.map((t) => {
                  const active = photo.tag === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onTag(photo, active ? null : t.id)}
                      className={`h-11 min-w-16 rounded-full px-4 text-[15px] font-medium transition ${
                        active ? (t.id === 'defect' ? 'bg-crit text-[#fff]' : 'bg-[#fff] text-[#16202a]') : 'bg-[#fff]/10 text-[#fff]/80 hover:bg-[#fff]/20'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })
              : photo.tag && (
                  <span className="rounded-full bg-[#fff]/15 px-3 py-1 text-sm">{PHOTO_TAGS.find((t) => t.id === photo.tag)?.label}</span>
                )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
