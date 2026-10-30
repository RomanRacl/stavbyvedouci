'use client';

import { Check } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { dayKey, workedMs } from '@/lib/jobDefaults';
import type { ActiveTimer, Job, TimeLog } from '@/types/firestore';

interface Props {
  open: boolean;
  onClose: () => void;
  logs: TimeLog[];
  timer: ActiveTimer | null;
  jobs: Job[];
  confirmedAt: Date | null;
  onConfirm: () => void;
}

const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
const time = (d: Date) => d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

/** Denní výkaz: co dnes dělník odpracoval a kde. Potvrzený výkaz je podklad pro mzdy. */
export function DayReportSheet({ open, onClose, logs, timer, jobs, confirmedAt, onConfirm }: Props) {
  const today = dayKey();
  const todays = logs.filter((l) => l.endedAt && dayKey(l.startedAt) === today).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const runningMin = timer ? Math.round(workedMs(timer) / 60000) : 0;
  const total = todays.reduce((a, l) => a + (l.durationMin ?? 0), 0) + runningMin;
  const breaks = todays.reduce((a, l) => a + (l.breakMin ?? 0), 0);
  const jobOf = (id: string) => jobs.find((j) => j.id === id);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Můj den"
      footer={
        confirmedAt ? (
          <p className="flex h-14 items-center justify-center gap-2 rounded-xl bg-good/10 text-base font-medium text-good-ink">
            <Check className="size-5" /> Potvrzeno v {time(confirmedAt)}
          </p>
        ) : (
          <button
            type="button"
            disabled={Boolean(timer) || todays.length === 0}
            onClick={onConfirm}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-ink text-base font-semibold text-white transition active:scale-[0.98] disabled:bg-line disabled:text-ink-3"
          >
            {timer ? 'Nejdřív ukončete běžící práci' : 'Potvrdit výkaz za dnešek'}
          </button>
        )
      }
    >
      <div className="pb-4">
        <div className="flex items-end justify-between rounded-2xl bg-ink p-4 text-white">
          <div>
            <p className="text-sm text-white/70">Dnes odpracováno</p>
            <p className="font-display text-4xl font-semibold tabular-nums">{hm(total)}</p>
          </div>
          {breaks > 0 && <p className="text-sm text-white/70">přestávky {breaks} min</p>}
        </div>

        {todays.length === 0 && !timer ? (
          <p className="mt-4 text-base text-ink-2">Dnes zatím nemáte žádný záznam. Čas se zapíše, když na zakázce klepnete na Začít a Ukončit.</p>
        ) : (
          <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {todays.map((l) => {
              const job = jobOf(l.jobId);
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base text-ink">{job?.title ?? 'Smazaná zakázka'}</span>
                    <span className="block text-sm text-ink-3 tabular-nums">
                      {time(l.startedAt)}–{l.endedAt && time(l.endedAt)}
                    </span>
                  </span>
                  <span className="text-base font-semibold text-ink tabular-nums">{hm(l.durationMin ?? 0)}</span>
                </li>
              );
            })}
            {timer && (
              <li className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-ink">{jobOf(timer.jobId)?.title}</span>
                  <span className="block text-sm text-ink-3 tabular-nums">od {time(timer.startedAt)}, stále běží</span>
                </span>
                <span className="text-base font-semibold text-ink-2 tabular-nums">{hm(runningMin)}</span>
              </li>
            )}
          </ol>
        )}
      </div>
    </BottomSheet>
  );
}
