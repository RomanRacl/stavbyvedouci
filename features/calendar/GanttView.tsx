'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Snapshot } from '@/lib/mock/localBackend';
import { absentOn } from '@/lib/people';
import { TRADE_LABEL } from '@/lib/trades';
import type { Job } from '@/types/firestore';

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = (d: Date) => {
  const m = startOfDay(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};

/**
 * Ganttův diagram zakázek na 9 týdnů: pruh = termín zakázky, výplň = dokončenost,
 * dílky = etapy (podle plánovaných hodin). Svislá čára = dnešek.
 */
export function GanttView({ snap }: { snap: Snapshot }) {
  const [offset, setOffset] = useState(0);
  const from = useMemo(() => new Date(mondayOf(new Date()).getTime() - 7 * DAY + offset * 7 * DAY), [offset]);
  const weeks = 9;
  const to = new Date(from.getTime() + weeks * 7 * DAY);
  const span = to.getTime() - from.getTime();
  const pos = (d: Date) => Math.min(100, Math.max(0, ((startOfDay(d).getTime() - from.getTime()) / span) * 100));
  const jobs = snap.jobs
    .filter((j) => ['draft', 'scheduled', 'in_progress', 'awaiting_approval'].includes(j.status) && j.schedule.due >= from && j.schedule.start <= to)
    .sort((a, b) => a.schedule.start.getTime() - b.schedule.start.getTime());
  const today = pos(new Date());
  const name = (uid: string) => snap.members.find((m) => m.uid === uid)?.displayName.split(' ').at(-1) ?? '';
  const absentDuring = (j: Job) =>
    j.assignedWorkerIds.filter((uid) => {
      for (let d = startOfDay(j.schedule.start); d <= j.schedule.due; d = new Date(d.getTime() + DAY)) if (absentOn(snap.absences, uid, d)) return true;
      return false;
    });

  return (
    <section className="rounded-xl border border-line bg-surface" aria-label="Ganttův diagram zakázek">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm">
        <button type="button" onClick={() => setOffset((o) => o - 4)} className="h-8 rounded-md border border-line px-2.5 text-ink-2 hover:text-ink">
          ← 4 týdny
        </button>
        <button type="button" onClick={() => setOffset(0)} className="h-8 rounded-md px-2.5 font-medium text-ink">
          Dnes
        </button>
        <button type="button" onClick={() => setOffset((o) => o + 4)} className="h-8 rounded-md border border-line px-2.5 text-ink-2 hover:text-ink">
          4 týdny →
        </button>
        <span className="ml-auto text-ink-3">{jobs.length} zakázek</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <div className="grid grid-cols-[260px_1fr] border-b border-line text-xs text-ink-2">
            <div className="px-3 py-2 font-medium">Zakázka</div>
            <div className="relative h-8">
              {Array.from({ length: weeks }, (_, i) => {
                const d = new Date(from.getTime() + i * 7 * DAY);
                return (
                  <span key={i} className="absolute top-2 border-l border-line pl-1" style={{ left: `${(i / weeks) * 100}%` }}>
                    {d.getDate()}. {d.getMonth() + 1}.
                  </span>
                );
              })}
            </div>
          </div>
          <ul className="relative">
            {jobs.map((j) => {
              const left = pos(j.schedule.start);
              const right = pos(new Date(j.schedule.due.getTime() + DAY));
              const width = Math.max(0.8, right - left);
              const stages = j.stages ?? [];
              const total = stages.reduce((a, s) => a + s.plannedHours, 0) || 1;
              const late = j.schedule.due.getTime() < Date.now() && j.progressPct < 100;
              const away = absentDuring(j);
              return (
                <li key={j.id} className="grid grid-cols-[260px_1fr] border-b border-line last:border-0">
                  <Link href={`/dashboard?job=${j.id}`} className="min-w-0 px-3 py-2 hover:bg-concrete/60">
                    <span className="block truncate text-sm font-medium text-ink">
                      <span className="font-display text-ink-2 tabular-nums">{j.code.slice(-4)}</span> {j.title}
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {TRADE_LABEL[j.trade]}, {j.assignedWorkerIds.map(name).join(', ') || 'bez party'}
                      {away.length > 0 && <span className="text-warn-ink"> · volno: {away.map(name).join(', ')}</span>}
                    </span>
                  </Link>
                  <div className="relative h-12">
                    {Array.from({ length: weeks }, (_, i) => (
                      <span key={i} className="absolute inset-y-0 border-l border-line/60" style={{ left: `${(i / weeks) * 100}%` }} />
                    ))}
                    <div
                      className={`absolute top-3 flex h-6 overflow-hidden rounded-md ${j.status === 'draft' ? 'border border-dashed border-ink-3' : late ? 'ring-1 ring-crit' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${j.schedule.start.toLocaleDateString('cs-CZ')} – ${j.schedule.due.toLocaleDateString('cs-CZ')}, hotovo ${j.progressPct} %`}
                    >
                      {stages.length > 0 ? (
                        stages.map((s) => (
                          <span key={s.id} className="relative h-full border-r border-surface/80 bg-series-1/20 last:border-0" style={{ width: `${(s.plannedHours / total) * 100}%` }} title={`${s.name}: ${s.progressPct} %`}>
                            <span className="absolute inset-y-0 left-0 bg-series-1" style={{ width: `${s.progressPct}%` }} />
                          </span>
                        ))
                      ) : (
                        <span className="relative h-full w-full bg-series-1/20">
                          <span className="absolute inset-y-0 left-0 bg-series-1" style={{ width: `${j.progressPct}%` }} />
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {today > 0 && today < 100 && (
              <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-crit/70" style={{ left: `calc(260px + (100% - 260px) * ${today / 100})` }} />
            )}
          </ul>
        </div>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Tmavá část pruhu = hotovo. Dílky jsou etapy. Červený okraj = po termínu. Svislá čára = dnes.</p>
    </section>
  );
}
