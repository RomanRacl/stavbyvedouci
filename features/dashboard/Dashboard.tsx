'use client';

import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ClipboardList, Plus, WifiOff } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { companyKpis } from '@/features/analytics/lib/metrics';
import { USE_MOCK, useDashboardData } from '@/features/jobs/hooks/useDashboardData';
import { useOptimisticJobs } from '@/features/jobs/hooks/useOptimisticJobs';
import {
  addNote,
  decideExtraWork,
  deleteJob,
  deletePhoto,
  setChecklist,
  setMaterialPlan,
  setPhotoTag,
  templateFromJob,
  updateJob,
  createOrder,
} from '@/lib/mock/localBackend';
import { jobShortages, stockRows } from '@/lib/stock';
import { allAlerts, jobAlerts } from '@/lib/analytics';
import Link from 'next/link';
import type { Job } from '@/types/firestore';
import { JobDetail } from './components/JobDetail';
import { JobList } from './components/JobList';
import { KpiStrip } from './components/KpiStrip';
import { MaterialDrawer } from './components/MaterialDrawer';
import { MaterialPlanDrawer } from './components/MaterialPlanDrawer';
import { NewJobDrawer } from './components/NewJobDrawer';
import { RevenueCostChart } from './components/RevenueCostChart';

interface DashboardProps {
  companyId: string;
  companyName: string;
  currentUid: string;
}

const PERIODS = [
  { weeks: 4, label: '4 týdny' },
  { weeks: 8, label: '8 týdnů' },
  { weeks: 12, label: '12 týdnů' },
] as const;

/* ---------- drobné pomocné části ---------- */

function LiveBadge({ status, at }: { status: string; at: Date | null }) {
  if (status === 'offline')
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-warn-ink">
        <WifiOff className="size-4" /> Offline, zobrazuji uložená data
      </span>
    );
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-crit-ink">
        <AlertCircle className="size-4" /> Spojení selhalo, obnovte stránku
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2 tabular-nums">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-good" />
      </span>
      Živá data{at && `, poslední změna ${at.toLocaleTimeString('cs-CZ')}`}
    </span>
  );
}

type ToastMsg = { text: string; tone: 'error' | 'success' };

function Toast({ message, onDone }: { message: ToastMsg | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-auto flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-xl"
          >
            {message.tone === 'error' ? (
              <AlertCircle className="size-4 text-safety" />
            ) : (
              <CheckCircle2 className="size-4 text-good" />
            )}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Načítám dashboard">
      <div className="h-[104px] animate-pulse rounded-xl bg-surface" />
      <div className="h-[360px] animate-pulse rounded-xl bg-surface" />
      <div className="grid gap-5 lg:grid-cols-[minmax(320px,2fr)_3fr]">
        <div className="h-[520px] animate-pulse rounded-xl bg-surface" />
        <div className="h-[520px] animate-pulse rounded-xl bg-surface max-lg:hidden" />
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="grid h-full place-items-center p-10 text-center">
      <div>
        <ClipboardList className="mx-auto size-8 text-ink-3" />
        <p className="mt-3 font-medium text-ink">Vyberte zakázku vlevo</p>
        <p className="mt-1 text-sm text-ink-2">Uvidíte rozpočet, partu na místě a predikci materiálu.</p>
      </div>
    </div>
  );
}

/* ---------- Dashboard ---------- */

export default function Dashboard({ companyId, companyName, currentUid }: DashboardProps) {
  const data = useDashboardData(companyId);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const showError = useCallback((text: string) => setToast({ text, tone: 'error' }), []);
  const { jobs, mutate, isPending } = useOptimisticJobs(data.jobs, showError);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  const [weeks, setWeeks] = useState<number>(12);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  /* Master-Detail stav synchronizovaný s URL (?job=…) bez navigace a bez re-renderu stránky.
     Next 15 propisuje window.history.pushState do useSearchParams, takže Zpět v prohlížeči zavře detail. */
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('job');
  const select = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('job', id);
    else url.searchParams.delete('job');
    window.history.pushState(null, '', url);
  }, []);

  const selected: Job | null = useMemo(() => jobs.find((j) => j.id === selectedId) ?? null, [jobs, selectedId]);
  /** Co chybí na vybranou zakázku, seskupeno podle dodavatele. */
  const shortages = useMemo(
    () => (selected ? jobShortages(selected, stockRows(data.catalog, data.stockMoves, data.vans), data.vans) : {}),
    [selected, data.catalog, data.stockMoves, data.vans],
  );
  const shortageCount = Object.values(shortages).reduce((a, l) => a + l.length, 0);
  const alertJobs = useMemo(() => [...new Map(allAlerts(jobs).map((a) => [a.job.id, a.job])).values()], [jobs]);
  const visibleStats = useMemo(() => data.weeklyStats.slice(-weeks), [data.weeklyStats, weeks]);
  const kpis = useMemo(
    () => companyKpis(data.weeklyStats, jobs, Math.min(4, Math.floor(data.weeklyStats.length / 2) || 1)),
    [data.weeklyStats, jobs],
  );

  /* One-click schválení: UI se přepne okamžitě, zápis běží na pozadí, chyba se vrátí toastem. */
  const approve = useCallback(
    (job: Job) => {
      const patch: Partial<Job> = {
        status: 'approved',
        approval: { approvedBy: currentUid, approvedAt: new Date() },
      };
      void mutate(
        job.id,
        patch,
        async () => {
          if (USE_MOCK) {
            await new Promise((r) => setTimeout(r, 700)); // simulace latence sítě
            data.mockWrite(job.id, patch);
            return;
          }
          const { approveJob } = await import('@/services/firebase/jobs.service');
          await approveJob(companyId, job.id, currentUid);
        },
        `Zakázku ${job.code} se nepodařilo schválit. Zkuste to znovu.`,
      );
    },
    [mutate, currentUid, companyId, data],
  );

  /* Založení zakázky: v mock režimu se uloží do prohlížeče, panel se zavře a nová zakázka se rovnou otevře. */
  const createJob = useCallback(
    (job: Job) => {
      if (!USE_MOCK) {
        showError('Zakládání do Firebase zatím není zapojené. Nastavte NEXT_PUBLIC_USE_MOCK=1.');
        return;
      }
      data.mockCreate(job);
      setNewJobOpen(false);
      select(job.id);
      setToast({ text: `Zakázka ${job.code} je založená.`, tone: 'success' });
    },
    [data, select, showError],
  );

  // Klávesnice: Esc zavře detail (když není otevřený Drawer – ten má vlastní Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedId && !materialsOpen && !newJobOpen && !planOpen) select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, materialsOpen, newJobOpen, planOpen, select]);

  return (
    <div>
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Hlavička + filtr období v jedné řadě nad grafy */}
        <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-2">{companyName}</p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Přehled zakázek</h1>
          </div>
          <LiveBadge status={data.status} at={data.lastEventAt} />
          <LayoutGroup id="period">
            <div role="radiogroup" aria-label="Období grafu" className="flex rounded-lg border border-line bg-surface p-1">
              {PERIODS.map((p) => {
                const active = p.weeks === weeks;
                return (
                  <button
                    key={p.weeks}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setWeeks(p.weeks)}
                    className={`relative rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:outline-none ${
                      active ? 'text-ink' : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    {active && (
                      <motion.span layoutId="period-pill" className="absolute inset-0 rounded-md bg-concrete" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                    )}
                    <span className="relative">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setNewJobOpen(true);
            }}
            disabled={data.status === 'loading'}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition hover:bg-ink/90 focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.97] disabled:opacity-50"
          >
            <Plus className="size-4" /> Nová zakázka
          </button>
        </header>

        {data.status === 'loading' ? (
          <Skeleton />
        ) : (
          <div className="space-y-5">
            {alertJobs.length > 0 && (
              <Link
                href="/analytika"
                className="flex items-center gap-3 rounded-xl border border-warn/40 bg-warn/8 px-4 py-3 text-sm transition hover:bg-warn/12"
              >
                <AlertCircle className="size-5 shrink-0 text-warn-ink" />
                <span className="min-w-0 flex-1 text-ink">
                  <strong>{alertJobs.length}</strong> {alertJobs.length === 1 ? 'zakázka potřebuje' : alertJobs.length < 5 ? 'zakázky potřebují' : 'zakázek potřebuje'} pozornost:{' '}
                  <span className="text-ink-2">{alertJobs.slice(0, 3).map((j) => j.code).join(', ')}{alertJobs.length > 3 ? ' a další' : ''}</span>
                </span>
                <span className="shrink-0 font-medium text-series-1-ink">Zobrazit</span>
              </Link>
            )}
            <KpiStrip kpis={kpis} windowWeeks={4} />
            <RevenueCostChart stats={visibleStats} />

            {/* Master-Detail */}
            <div className="grid gap-5 lg:h-[calc(100dvh-7rem)] lg:min-h-[560px] lg:grid-cols-[minmax(320px,2fr)_3fr]">
              <JobList jobs={jobs} selectedId={selectedId} onSelect={select} />

              {/* Desktop: pravý panel. Mobil: celoobrazovkový list přes seznam. */}
              <section
                aria-label="Detail zakázky"
                className={`overflow-hidden rounded-xl border border-line bg-surface ${
                  selected ? 'max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:rounded-none max-lg:border-0' : 'max-lg:hidden'
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {selected ? (
                    <JobDetail
                      key={selected.id}
                      job={selected}
                      members={data.members}
                      photos={data.photos.filter((p) => p.jobId === selected.id)}
                      onDeletePhoto={(p) => {
                        void deletePhoto(p.id);
                        setToast({ text: 'Fotka smazána.', tone: 'success' });
                      }}
                      approving={isPending(selected.id)}
                      onApprove={() => approve(selected)}
                      onOpenMaterials={() => setMaterialsOpen(true)}
                      onPlanMaterials={() => setPlanOpen(true)}
                      onBack={() => select(null)}
                      onTagPhoto={(p, tag) => setPhotoTag(p.id, tag)}
                      notes={data.notes.filter((n) => n.jobId === selected.id)}
                      myUid={currentUid}
                      onSendNote={(text) => addNote(currentUid, selected.id, text)}
                      onEdit={() => {
                        setEditing(selected);
                        setNewJobOpen(true);
                      }}
                      onDelete={() => {
                        deleteJob(selected.id);
                        select(null);
                        setToast({ text: `Zakázka ${selected.code} je smazaná.`, tone: 'success' });
                      }}
                      onDecideExtra={(extraId, d) => {
                        decideExtraWork(selected.id, extraId, d);
                        setToast({ text: d.approve ? 'Vícepráce schválena, cena zakázky navýšena.' : 'Vícepráce zamítnuta.', tone: 'success' });
                      }}
                      onSetChecklist={(items) => setChecklist(selected.id, items)}
                      settings={data.settings}
                      onToast={(text) => setToast({ text, tone: 'success' })}
                      alerts={jobAlerts(selected)}
                      ops={{ timeLogs: data.timeLogs, usage: data.usage, audit: data.audit, catalog: data.catalog }}
                      shortageCount={shortageCount}
                      onOrderMissing={() => {
                        const created = Object.entries(shortages).map(([supplier, lines]) => createOrder(supplier, lines, selected.id));
                        setToast({
                          text: `Připraveno ${created.length === 1 ? `${created[0].number}` : `${created.length} objednávek`} v Objednávkách, zkontrolujte a odešlete.`,
                          tone: 'success',
                        });
                      }}
                      onSaveTemplate={(name) => {
                        templateFromJob(selected, name);
                        setToast({ text: `Šablona „${name}“ uložena, najdete ji v Šablonách.`, tone: 'success' });
                      }}
                    />
                  ) : (
                    <motion.div key="empty" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <EmptyDetail />
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </div>
          </div>
        )}
      </div>

      <MaterialDrawer
        companyId={companyId}
        job={selected}
        members={data.members}
        open={materialsOpen && Boolean(selected)}
        onClose={() => setMaterialsOpen(false)}
      />
      <MaterialPlanDrawer
        job={selected}
        catalog={data.catalog}
        open={planOpen && Boolean(selected)}
        onClose={() => setPlanOpen(false)}
        onSave={(plan) => {
          if (!selected) return;
          if (!USE_MOCK) {
            showError('Ukládání plánu do Firebase zatím není zapojené.');
            return;
          }
          setMaterialPlan(selected.id, plan);
          setPlanOpen(false);
          setToast({ text: `Plán materiálu pro ${selected.code} je uložený.`, tone: 'success' });
        }}
      />
      <NewJobDrawer
        open={newJobOpen}
        onClose={() => {
          setNewJobOpen(false);
          setEditing(null);
        }}
        members={data.members}
        existingJobs={jobs}
        templates={data.templates}
        catalog={data.catalog}
        settings={data.settings}
        certificates={data.certificates}
        onCreate={createJob}
        editing={editing}
        onUpdate={(jobId, patch) => {
          updateJob(jobId, patch);
          setNewJobOpen(false);
          setEditing(null);
          setToast({ text: 'Změny zakázky jsou uložené.', tone: 'success' });
        }}
      />
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
