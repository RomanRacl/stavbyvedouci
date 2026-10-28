'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, MapPin, Play } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { StatusPill } from '@/components/ui/StatusPill';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import { issueMaterial, setProgress, startWork, stopWork, submitForApproval } from '@/lib/mock/localBackend';
import type { Job } from '@/types/firestore';
import { MaterialSheet } from './components/MaterialSheet';
import { TimerButton } from './components/TimerButton';
import { WorkerJobView } from './components/WorkerJobView';
import { WorkerPicker } from './components/WorkerPicker';
import { buzz, useCurrentWorker, useWorkerData } from './hooks/useWorkerData';

const ACTIVE = new Set<Job['status']>(['scheduled', 'in_progress']);

const formatMinutes = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

/** Termín zakázky lidsky: „dnes“, „zítra“, nebo datum. */
function whenLabel(job: Job) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = day(new Date());
  const start = day(job.schedule.start);
  const due = day(job.schedule.due);
  if (start <= today && due >= today) return `běží do ${fmt.date(job.schedule.due)}`;
  if (start === today + 86_400_000) return 'začíná zítra';
  if (start > today) return `začíná ${fmt.date(job.schedule.start)}`;
  return `termín ${fmt.date(job.schedule.due)}`;
}

function JobCard({ job, running, canStart, onOpen, onStart }: { job: Job; running: boolean; canStart: boolean; onOpen: () => void; onStart: () => void }) {
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 pt-4 pb-3 text-left active:bg-concrete">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold text-ink-2 tabular-nums">{job.code}</span>
            <StatusPill status={job.status} />
          </span>
          <span className="mt-1 block text-lg leading-snug font-semibold text-ink">{job.title}</span>
          <span className="mt-1 flex items-start gap-1 text-[15px] text-ink-2">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">{job.client.address}</span>
          </span>
          <span className="mt-1 block text-sm text-ink-3">{whenLabel(job)}</span>
        </span>
        <ChevronRight className="mt-6 size-5 shrink-0 text-ink-3" aria-hidden />
      </button>
      {!running && job.status !== 'awaiting_approval' && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onStart}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-ink text-base font-bold text-white transition active:scale-[0.98]"
          >
            <Play className="size-4 fill-current" /> {canStart ? 'Začít práci' : 'Přepnout sem a začít'}
          </button>
        </div>
      )}
    </motion.li>
  );
}

export default function WorkerApp() {
  const snap = useWorkerData();
  const [uid, setUid] = useCurrentWorker();
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const say = (text: string, tone: ToastMsg['tone'] = 'success') => setToast({ text, tone, id: Date.now() });
  const [materialOpen, setMaterialOpen] = useState(false);

  /* Otevřená zakázka v URL (?job=…): tlačítko Zpět v telefonu ji zavře. */
  const params = useSearchParams();
  const openId = params.get('job');
  const open = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('job', id);
    else url.searchParams.delete('job');
    window.history.pushState(null, '', url);
  }, []);

  const me = snap?.members.find((m) => m.uid === uid) ?? null;
  const myJobs = useMemo(
    () =>
      (snap?.jobs ?? [])
        .filter((j) => uid && j.assignedWorkerIds.includes(uid))
        .sort((a, b) => a.schedule.start.getTime() - b.schedule.start.getTime()),
    [snap, uid],
  );
  const active = myJobs.filter((j) => ACTIVE.has(j.status));
  const waiting = myJobs.filter((j) => j.status === 'awaiting_approval');
  const openJob = myJobs.find((j) => j.id === openId) ?? null;
  const timer = me?.activeTimer ?? null;
  const timerJob = timer ? (snap?.jobs.find((j) => j.id === timer.jobId) ?? null) : null;

  if (!snap || uid === undefined) return <div className="min-h-dvh bg-concrete" aria-busy="true" />;
  if (!uid || !me) return <WorkerPicker members={snap.members} onPick={setUid} />;

  /* ---------- akce: okamžitý zápis + potvrzení vibrací a toastem ---------- */

  const start = (job: Job) => {
    buzz();
    const { stoppedJob, stoppedMinutes } = startWork(me.uid, job.id);
    say(
      stoppedJob
        ? `Ukončeno na ${stoppedJob.code} (${formatMinutes(stoppedMinutes)}), měřím na ${job.code}.`
        : `Měřím čas na ${job.code}.`,
    );
  };
  const stop = () => {
    buzz();
    const { minutes, job } = stopWork(me.uid);
    if (job) say(`Zapsáno ${formatMinutes(minutes)} na ${job.code}.`);
  };

  return (
    <div className="min-h-dvh bg-concrete">
      <main className="mx-auto max-w-md px-4 pt-6 pb-16">
        <header className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-ink font-display font-semibold text-white">{me.initials}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-2">{new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="truncate font-display text-xl font-bold text-ink">{me.displayName}</h1>
          </div>
          <button type="button" onClick={() => setUid(null)} className="h-11 rounded-xl px-3 text-sm font-medium text-ink-2 active:bg-surface">
            Nejsem to já
          </button>
        </header>

        {/* Běžící měření je vždy nahoře, ať je zakázka otevřená, nebo ne. */}
        <AnimatePresence initial={false}>
          {timer && timerJob && (
            <motion.section
              key="running"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6"
              aria-label="Běžící práce"
            >
              <button type="button" onClick={() => open(timerJob.id)} className="mb-2 flex w-full items-center gap-1 text-left text-base font-semibold text-ink">
                <span className="min-w-0 truncate">{timerJob.title}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-3" />
              </button>
              <TimerButton running={timer} switching={false} onStart={() => undefined} onStop={stop} />
            </motion.section>
          )}
        </AnimatePresence>

        <section className="mt-8" aria-labelledby="mine-h">
          <h2 id="mine-h" className="text-base font-semibold text-ink">
            Moje zakázky
          </h2>
          {active.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-base text-ink-2">
              Nemáte přiřazenou žádnou zakázku. Až vám ji kancelář přidělí, objeví se tady.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              <AnimatePresence initial={false}>
                {active.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    running={timer?.jobId === job.id}
                    canStart={!timer}
                    onOpen={() => open(job.id)}
                    onStart={() => start(job)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {waiting.length > 0 && (
          <section className="mt-8" aria-labelledby="wait-h">
            <h2 id="wait-h" className="text-base font-semibold text-ink">
              Čeká na schválení
            </h2>
            <ul className="mt-3 space-y-2">
              {waiting.map((job) => (
                <li key={job.id}>
                  <button type="button" onClick={() => open(job.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left active:bg-concrete">
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-sm font-semibold text-ink-2">{job.code}</span>
                      <span className="block truncate text-base text-ink">{job.title}</span>
                    </span>
                    <ChevronRight className="size-5 text-ink-3" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <AnimatePresence>
        {openJob && (
          <WorkerJobView
            key={openJob.id}
            job={openJob}
            myTimer={timer}
            onBack={() => open(null)}
            onStart={() => start(openJob)}
            onStop={stop}
            onProgress={(p) => setProgress(openJob.id, p)}
            onOpenMaterial={() => setMaterialOpen(true)}
            onSubmit={() => {
              submitForApproval(me.uid, openJob.id);
              say(`${openJob.code} předána ke schválení.`);
              open(null);
            }}
          />
        )}
      </AnimatePresence>

      {openJob && (
        <MaterialSheet
          job={openJob}
          open={materialOpen}
          onClose={() => setMaterialOpen(false)}
          onSubmit={(items) => {
            issueMaterial(me.uid, openJob.id, items);
            setMaterialOpen(false);
            buzz();
            say(`Výdej zapsán na ${openJob.code}.`);
          }}
        />
      )}

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
