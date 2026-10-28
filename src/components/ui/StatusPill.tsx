import { CheckCircle2, Circle, CircleDashed, Clock3, Hammer, Receipt } from 'lucide-react';
import type { JobStatus } from '@/types/firestore';
import { STATUS_META } from '@/features/analytics/lib/metrics';

const ICON = {
  draft: CircleDashed,
  scheduled: Circle,
  in_progress: Hammer,
  awaiting_approval: Clock3,
  approved: CheckCircle2,
  invoiced: Receipt,
} as const;

const TONE = {
  neutral: 'bg-concrete text-ink-2',
  info: 'bg-series-1/10 text-series-1-ink',
  warn: 'bg-warn/12 text-warn-ink',
  good: 'bg-good/12 text-good-ink',
  muted: 'bg-concrete text-ink-3',
} as const;

/** Stav nikdy jen barvou: ikona + text. */
export function StatusPill({ status }: { status: JobStatus }) {
  const meta = STATUS_META[status];
  const Icon = ICON[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[meta.tone]}`}>
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}
