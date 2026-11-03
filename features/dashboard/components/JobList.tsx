'use client';

import { LayoutGroup, motion } from 'framer-motion';
import { Search, TrendingDown, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { StatusPill } from '@/components/ui/StatusPill';
import { fmt, jobFinancials } from '@/features/analytics/lib/metrics';
import { extraWorkOf } from '@/lib/jobDefaults';
import type { Job, JobStatus } from '@/types/firestore';

const FILTERS: Array<{ id: 'all' | JobStatus; label: string }> = [
  { id: 'all', label: 'Aktivní' },
  { id: 'awaiting_approval', label: 'Ke schválení' },
  { id: 'in_progress', label: 'Probíhá' },
  { id: 'scheduled', label: 'Naplánováno' },
  { id: 'approved', label: 'Schváleno' },
  { id: 'invoiced', label: 'Archiv' },
];

/** Co vyžaduje akci majitele, jde nahoru. */
const PRIORITY: Record<JobStatus, number> = {
  awaiting_approval: 0,
  in_progress: 1,
  scheduled: 2,
  draft: 3,
  approved: 4,
  invoiced: 5,
};

interface Props {
  jobs: Job[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function JobList({ jobs, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    // „Aktivní“ = vše kromě vyfakturovaných, které jsou v Archivu.
    const c: Record<string, number> = { all: jobs.filter((j) => j.status !== 'invoiced').length };
    jobs.forEach((j) => (c[j.status] = (c[j.status] ?? 0) + 1));
    return c;
  }, [jobs]);

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('cs');
    return jobs
      .filter((j) => (filter === 'all' ? j.status !== 'invoiced' : j.status === filter))
      .filter(
        (j) =>
          !needle ||
          [j.code, j.title, j.client.name, j.client.address].some((s) => s.toLocaleLowerCase('cs').includes(needle)),
      )
      .sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [jobs, filter, q]);

  return (
    <section aria-label="Zakázky" className="flex min-h-0 flex-col rounded-xl border border-line bg-surface">
      <div className="space-y-3 border-b border-line p-4">
        <label className="relative block">
          <span className="sr-only">Hledat zakázku</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat podle kódu, klienta nebo adresy"
            className="h-10 w-full rounded-lg border border-line bg-concrete/50 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 transition focus:border-series-1 focus:bg-surface focus:outline-none"
          />
        </label>
        <LayoutGroup id="job-filters">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filtr stavu">
            {FILTERS.map((f) => {
              const active = f.id === filter;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.id)}
                  className={`relative shrink-0 rounded-md px-2.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:outline-none ${
                    active ? 'text-white' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="filter-pill"
                      className="absolute inset-0 rounded-md bg-ink"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative">
                    {f.label} <span className={active ? 'text-white/60' : 'text-ink-3'}>{counts[f.id] ?? 0}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      <LayoutGroup id="job-rows">
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {visible.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-ink-2">
              Žádná zakázka neodpovídá filtru. Zkuste jiný stav nebo vymažte hledání.
            </li>
          )}
          {visible.map((job) => {
            const f = jobFinancials(job);
            const selected = job.id === selectedId;
            const losing = f.forecastMarginPct < 0;
            return (
              <motion.li key={job.id} layout="position" transition={{ duration: 0.25 }}>
                <button
                  type="button"
                  onClick={() => onSelect(job.id)}
                  aria-current={selected ? 'true' : undefined}
                  className="group relative w-full rounded-lg px-3 py-3 text-left focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:outline-none"
                >
                  {selected && (
                    <motion.span
                      layoutId="row-selection"
                      className="absolute inset-0 rounded-lg bg-concrete"
                      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                    >
                      <span className="hazard absolute inset-y-2 left-0 w-1 rounded-full" />
                    </motion.span>
                  )}
                  <span className="relative flex items-start gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold text-ink-2 tabular-nums">{job.code}</span>
                        <StatusPill status={job.status} />
                        {extraWorkOf(job).some((e) => e.status === 'pending') && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-xs font-medium text-warn-ink">
                            <Wrench className="size-3" aria-hidden /> vícepráce
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block truncate font-medium text-ink group-hover:underline group-hover:underline-offset-4">
                        {job.title}
                      </span>
                      <span className="block truncate text-sm text-ink-2">{job.client.name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={`flex items-center justify-end gap-1 text-sm font-semibold tabular-nums ${
                          losing ? 'text-crit-ink' : 'text-ink'
                        }`}
                      >
                        {losing && <TrendingDown className="size-3.5" aria-label="Ztrátová" />}
                        {fmt.pct(f.forecastMarginPct)}
                      </span>
                      <span className="block text-xs text-ink-3">prognóza marže</span>
                    </span>
                  </span>
                  <span className="relative mt-2.5 block h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                    <motion.span
                      className="block h-full rounded-full bg-ink-2"
                      initial={false}
                      animate={{ width: `${job.progressPct}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <span className="sr-only">Dokončeno {job.progressPct} %</span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </LayoutGroup>
    </section>
  );
}
