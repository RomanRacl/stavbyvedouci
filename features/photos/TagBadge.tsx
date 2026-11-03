import { PHOTO_TAGS } from '@/lib/jobDefaults';
import type { PhotoTag } from '@/types/firestore';

/** Štítek v rohu náhledu fotky. */
export function TagBadge({ tag }: { tag?: PhotoTag | null }) {
  if (!tag) return null;
  const label = PHOTO_TAGS.find((t) => t.id === tag)?.label;
  return (
    <span
      className={`pointer-events-none absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        tag === 'defect' ? 'bg-crit text-white' : 'bg-ink/75 text-white'
      }`}
    >
      {label}
    </span>
  );
}
