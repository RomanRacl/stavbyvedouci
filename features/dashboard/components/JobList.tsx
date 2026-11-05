'use client';

import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Check, ListChecks, Search, TrendingDown, Wrench, X } from 'lucide-react';
import { bulkAssign, bulkDelete, bulkShift, bulkStatus } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  /** Hlášení výsledku hromadné akce. */
  onToast?: (text: string) => void;
}

export function JobList({ jobs, selectedId, onSelect, onToast }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [q, setQ] = useState('');
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  /* Vykresluje se jen prvních N řádků, další se dočtou při posunu dolů – seznam zůstane plynulý i s tisíci zakázek. */
  const PAGE = 60;
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLLIElement>(null);
  useEffect(() => setLimit(PAGE), [filter, q]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setLimit((l) => l + PAGE), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  });
  const snap = useSnapshot();
  const workers = (snap?.members ?? []).filter((m) => m.role !== 'owner');
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const ids = [...picked];
  const done = (text: string) => {
    onToast?.(text);
    setPicked(new Set());
    setConfirmDel(false);
  };

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
            className="h-10 w-full rounded-lg border border-line bg-concrete/50 pr-12 pl-9 text-sm text-ink placeholder:text-ink-3 transition focus:border-series-1 focus:bg-surface focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setBulk((b) => !b);
              setPicked(new Set());
            }}
            aria-pressed={bulk}
            title="Vybrat více zakázek a upravit je najednou"
            aria-label="Hromadný výběr"
            className={`absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md ${bulk ? 'bg-ink text-white' : 'text-ink-2 hover:bg-concrete hover:text-ink'}`}
          >
            <ListChecks className="size-4" />
          </button>
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
          {visible.slice(0, limit).map((job) => {
            const f = jobFinancials(job);
            const selected = job.id === selectedId;
            const losing = f.forecastMarginPct < 0;
            return (
              <motion.li key={job.id} layout="position" transition={{ duration: 0.25 }}>
                <button
                  type="button"
                  onClick={() => (bulk ? toggle(job.id) : onSelect(job.id))}
                  aria-current={selected && !bulk ? 'true' : undefined}
                  aria-pressed={bulk ? picked.has(job.id) : undefined}
                  className="group relative w-full rounded-lg px-3 py-3 text-left focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:outline-none"
                >
                  {bulk && picked.has(job.id) && <span className="absolute inset-0 rounded-lg bg-series-1/10" />}
                  {selected && !bulk && (
                    <motion.span
                      layoutId="row-selection"
                      className="absolute inset-0 rounded-lg bg-concrete"
                      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                    >
                      <span className="hazard absolute inset-y-2 left-0 w-1 rounded-full" />
                    </motion.span>
                  )}
                  <span className="relative flex items-start gap-3">
                    {bulk && (
                      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border-2 ${picked.has(job.id) ? 'border-ink bg-ink text-white' : 'border-line'}`} aria-hidden>
                        {picked.has(job.id) && <Check className="size-3" strokeWidth={3} />}
                      </span>
                    )}
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
          {visible.length > limit && (
            <li ref={sentinel} className="px-3 py-3 text-center">
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="text-sm font-medium text-series-1-ink underline-offset-4 hover:underline">
                Zobrazit dalších {Math.min(PAGE, visible.length - limit)} z {visible.length - limit}
              </button>
            </li>
          )}
        </ul>
      </LayoutGroup>
      <AnimatePresence>
        {bulk && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-line bg-concrete/60">
            <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="font-medium text-ink tabular-nums">Vybráno {picked.size}</span>
              <button type="button" onClick={() => setPicked(new Set(visible.map((j) => j.id)))} className="text-series-1-ink underline-offset-4 hover:underline">
                vše ({visible.length})
              </button>
              <span className="flex-1" />
              <button type="button" aria-label="Ukončit výběr" onClick={() => setBulk(false)} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-surface">
                <X className="size-4" />
              </button>
              <div className="flex w-full flex-wrap gap-2">
                <select
                  aria-label="Posunout termín"
                  disabled={!picked.size}
                  value=""
                  onChange={(e) => {
                    const d = Number(e.target.value);
                    if (!d) return;
                    bulkShift(ids, d);
                    done(`${ids.length} zakázek posunuto o ${d > 0 ? '+' : ''}${d} dní.`);
                  }}
                  className="h-9 rounded-md border border-line bg-surface px-2 text-sm disabled:opacity-50"
                >
                  <option value="">Posunout termín…</option>
                  {[-7, -1, 1, 2, 3, 7, 14].map((d) => (
                    <option key={d} value={d}>
                      {d > 0 ? '+' : ''}
                      {d} {Math.abs(d) === 1 ? 'den' : 'dní'}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Přidat pracovníka"
                  disabled={!picked.size}
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    bulkAssign(ids, e.target.value, 'add');
                    done(`${workers.find((w) => w.uid === e.target.value)?.displayName} přidán na ${ids.length} zakázek.`);
                  }}
                  className="h-9 rounded-md border border-line bg-surface px-2 text-sm disabled:opacity-50"
                >
                  <option value="">Přidat člověka…</option>
                  {workers.map((w) => (
                    <option key={w.uid} value={w.uid}>
                      {w.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!picked.size}
                  onClick={() => {
                    const n = bulkStatus(ids, 'approved');
                    done(n ? `Schváleno ${n} zakázek.` : 'Žádná z vybraných nečekala na schválení.');
                  }}
                  className="h-9 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-ink-3 disabled:opacity-50"
                >
                  Schválit
                </button>
                {confirmDel ? (
                  <button
                    type="button"
                    onClick={() => {
                      bulkDelete(ids);
                      done(`Smazáno ${ids.length} zakázek.`);
                    }}
                    className="h-9 rounded-md bg-crit px-3 text-sm font-semibold text-white"
                  >
                    Opravdu smazat {picked.size}?
                  </button>
                ) : (
                  <button type="button" disabled={!picked.size} onClick={() => setConfirmDel(true)} className="h-9 rounded-md px-3 text-sm text-ink-2 hover:bg-crit/10 hover:text-crit-ink disabled:opacity-50">
                    Smazat
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
