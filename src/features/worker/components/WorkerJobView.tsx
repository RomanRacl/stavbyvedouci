'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Clock3, MapPin, Navigation, Package, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fmt } from '@/features/analytics/lib/metrics';
import type { ActiveTimer, Job } from '@/types/firestore';
import { buzz } from '../hooks/useWorkerData';
import { TimerButton } from './TimerButton';

const STEPS = [0, 25, 50, 75, 100];

interface Props {
  job: Job;
  myTimer: ActiveTimer | null;
  onBack: () => void;
  onStart: () => void;
  onStop: () => void;
  onProgress: (pct: number) => void;
  onOpenMaterial: () => void;
  onSubmit: () => void;
}

export function WorkerJobView({ job, myTimer, onBack, onStart, onStop, onProgress, onOpenMaterial, onSubmit }: Props) {
  const runningHere = myTimer?.jobId === job.id ? myTimer : null;
  const locked = job.status === 'awaiting_approval' || job.status === 'approved' || job.status === 'invoiced';

  /* Předání vyžaduje dvě klepnutí – první tlačítko „nabije“, druhé potvrdí. Po 4 s se vrátí. */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.client.address)}`;

  return (
    <motion.main
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 420, damping: 42 }}
      className="fixed inset-0 z-30 overflow-y-auto bg-concrete"
    >
      <div className="mx-auto max-w-md px-4 pt-4 pb-28">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex h-12 items-center gap-1.5 rounded-xl px-2 text-base font-medium text-ink-2 active:bg-surface"
        >
          <ArrowLeft className="size-5" /> Moje zakázky
        </button>

        <header className="mt-2">
          <p className="font-display text-sm font-semibold text-ink-2 tabular-nums">{job.code}</p>
          <h1 className="mt-0.5 font-display text-[1.75rem] leading-tight font-bold tracking-tight text-ink">{job.title}</h1>
          <p className="mt-2 flex items-start gap-1.5 text-base text-ink-2">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {job.client.address}
          </p>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-base font-medium text-ink active:bg-concrete"
          >
            <Navigation className="size-4" /> Navigovat
          </a>
          <a
            href={job.client.phone ? `tel:${job.client.phone.replace(/\s/g, '')}` : undefined}
            aria-disabled={!job.client.phone}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-base font-medium active:bg-concrete ${
              job.client.phone ? 'text-ink' : 'pointer-events-none text-ink-3'
            }`}
          >
            <Phone className="size-4" /> Zavolat klientovi
          </a>
        </div>

        {locked ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-warn/12 p-4 text-warn-ink">
            <Clock3 className="mt-0.5 size-5 shrink-0" />
            <p className="text-base">
              {job.status === 'awaiting_approval'
                ? 'Předáno ke schválení. Čeká se na majitele, nic dalšího tu nemusíte dělat.'
                : 'Zakázka je schválená a uzavřená.'}
            </p>
          </div>
        ) : (
          <>
            <section className="mt-6" aria-label="Měření času">
              <TimerButton
                running={runningHere}
                switching={Boolean(myTimer && !runningHere)}
                onStart={onStart}
                onStop={onStop}
              />
            </section>

            <section className="mt-8" aria-labelledby="progress-h">
              <div className="flex items-baseline justify-between">
                <h2 id="progress-h" className="text-base font-semibold text-ink">
                  Kolik je hotovo?
                </h2>
                {!STEPS.includes(job.progressPct) && (
                  <span className="text-sm text-ink-3 tabular-nums">nyní {job.progressPct} %</span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Dokončenost">
                {STEPS.map((p) => {
                  const active = job.progressPct === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={job.progressPct === p}
                      onClick={() => {
                        buzz();
                        onProgress(p);
                      }}
                      className={`relative h-14 rounded-xl text-base font-semibold tabular-nums transition active:scale-95 ${
                        active ? 'text-white' : 'border border-line bg-surface text-ink-2'
                      }`}
                    >
                      {active && (
                        <motion.span layoutId="progress-pill" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                      )}
                      <span className="relative">{p} %</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mt-8" aria-labelledby="mat-h">
              <div className="flex items-center justify-between">
                <h2 id="mat-h" className="text-base font-semibold text-ink">
                  Materiál
                </h2>
                <span className="text-sm text-ink-3">vydáno / plán</span>
              </div>
              {job.materialPlan.length > 0 && (
                <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
                  {job.materialPlan.map((l) => {
                    const over = l.usedQty > l.plannedQty;
                    return (
                      <li key={l.materialId} className="flex items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1 text-base text-ink">{l.name}</span>
                        <span className={`text-base tabular-nums ${over ? 'font-semibold text-crit-ink' : 'text-ink-2'}`}>
                          {l.plannedQty === 0
                            ? `${fmt.num(l.usedQty)} ${l.unit}, mimo plán`
                            : `${fmt.num(l.usedQty)} / ${fmt.num(l.plannedQty)} ${l.unit}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                onClick={onOpenMaterial}
                className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-ink bg-surface text-base font-semibold text-ink transition active:scale-[0.98]"
              >
                <Package className="size-5" /> Vydat materiál
              </button>
            </section>
          </>
        )}
      </div>

      {!locked && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-md">
            <motion.button
              type="button"
              layout
              onClick={() => {
                buzz();
                if (armed) {
                  setArmed(false);
                  onSubmit();
                } else setArmed(true);
              }}
              className={`flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors ${
                armed ? 'bg-good text-white' : 'bg-concrete text-ink'
              }`}
            >
              <Check className="size-5" />
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={armed ? 'armed' : 'idle'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {armed ? 'Klepněte znovu pro potvrzení' : 'Hotovo, předat ke schválení'}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      )}
    </motion.main>
  );
}
