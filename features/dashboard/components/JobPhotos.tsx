'use client';

import { Camera } from 'lucide-react';
import { useState } from 'react';
import { PhotoImg } from '@/features/photos/PhotoThumb';
import { PhotoViewer } from '@/features/photos/PhotoViewer';
import { TagBadge } from '@/features/photos/TagBadge';
import { PHOTO_TAGS } from '@/lib/jobDefaults';
import type { JobPhoto, Member, PhotoTag } from '@/types/firestore';

const PREVIEW = 8;

/** Fotky z terénu v detailu zakázky. Kancelář smí mazat všechny (např. omylem nahranou soukromou fotku). */
export function JobPhotos({
  jobId,
  photos,
  members,
  onDelete,
  onTag,
}: {
  jobId: string;
  photos: JobPhoto[];
  members: Member[];
  onDelete: (p: JobPhoto) => void;
  onTag: (p: JobPhoto, tag: PhotoTag | null) => void;
}) {
  const [viewer, setViewer] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<PhotoTag | 'all'>('all');
  const filtered = filter === 'all' ? photos : photos.filter((p) => p.tag === filter);
  const shown = all ? filtered : filtered.slice(0, PREVIEW);
  const usedTags = PHOTO_TAGS.filter((t) => photos.some((p) => p.tag === t.id));
  const latest = photos[0];

  return (
    <section aria-labelledby={`photos-${jobId}`}>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 id={`photos-${jobId}`} className="text-sm font-semibold text-ink">
          Fotky z terénu
        </h3>
        {latest && (
          <span className="text-sm text-ink-3 tabular-nums">
            {photos.length}, poslední {latest.takenAt.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {usedTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtr podle štítku">
          {[{ id: 'all' as const, label: 'Vše' }, ...usedTags].map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={`h-8 rounded-full px-3 text-sm transition ${filter === t.id ? 'bg-ink text-white' : 'bg-concrete text-ink-2 hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {photos.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-2">
          <Camera className="size-4 shrink-0 text-ink-3" />
          Zatím žádné fotky. Parta je přidá v mobilu tlačítkem Vyfotit.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {shown.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setViewer(i)}
                  className="group relative block aspect-square w-full overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:outline-none"
                >
                  <PhotoImg photo={p} alt={`Fotka ${i + 1} ze zakázky`} className="size-full transition duration-300 group-hover:scale-105" />
                  <TagBadge tag={p.tag} />
                </button>
              </li>
            ))}
          </ul>
          {filtered.length > PREVIEW && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm font-medium text-series-1-ink underline-offset-4 hover:underline">
              {all ? 'Zobrazit méně' : `Zobrazit všech ${filtered.length}`}
            </button>
          )}
        </>
      )}

      <PhotoViewer photos={filtered} index={viewer} members={members} onIndex={setViewer} canDelete={() => true} onDelete={onDelete} onTag={onTag} />
    </section>
  );
}
