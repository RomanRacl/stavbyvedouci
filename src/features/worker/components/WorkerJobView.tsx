'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Check, Clock3, Crosshair, Hammer, MapPin, Navigation, Package, Phone, Wrench } from 'lucide-react';
import { localeOf, t } from '@/lib/i18n';
import { useState } from 'react';
import { fmt } from '@/features/analytics/lib/metrics';
import { NotesThread } from '@/features/notes/NotesThread';
import { checklistOf, extraWorkOf } from '@/lib/jobDefaults';
import { mapyNavigationUrl } from '@/lib/navigation';
import { navUrls } from '@/lib/geo';
import type { ActiveTimer, Job, JobNote, JobPhoto, Member, PhotoTag } from '@/types/firestore';
import { buzz } from '../hooks/useWorkerData';
import { ExtraWorkSheet } from './ExtraWorkSheet';
import { HandoverSheet } from './HandoverSheet';
import { TimerButton } from './TimerButton';
import { WorkerPhotos } from './WorkerPhotos';

const STEPS = [0, 25, 50, 75, 100];

interface Props {
  job: Job;
  myTimer: ActiveTimer | null;
  members: Member[];
  myUid: string;
  photos: JobPhoto[];
  notes: JobNote[];
  onBack: () => void;
  onStart: (stageId: string | null) => void;
  onStageProgress: (stageId: string, pct: number) => void;
  onSwitchStage: (stageId: string) => void;
  onStop: (endAt?: Date) => void;
  onPause: () => void;
  onResume: () => void;
  onProgress: (pct: number) => void;
  onOpenMaterial: () => void;
  onSubmit: (h: { clientName: string; signature: string | null }) => void;
  onAddPhotos: (files: File[]) => Promise<number>;
  onDeletePhoto: (photo: JobPhoto) => void;
  onTagPhoto: (photo: JobPhoto, tag: PhotoTag | null) => void;
  onToggleCheck: (itemId: string) => void;
  onAddExtra: (input: { description: string; hours: number; materialCost: number }) => void;
  onSendNote: (text: string) => void;
  /** Uloží polohu stavby z telefonu (jen když ji zakázka ještě nemá). */
  onSaveSite?: () => Promise<void>;
}

const EXTRA_STATUS = {
  pending: { label: () => t('Čeká na schválení'), cls: 'bg-warn/12 text-warn-ink' },
  approved: { label: () => t('Schváleno'), cls: 'bg-good/12 text-good-ink' },
  rejected: { label: () => t('Zamítnuto'), cls: 'bg-concrete text-ink-3' },
} as const;

function SectionTitle({ id, children, aside }: { id: string; children: string; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 id={id} className="text-base font-semibold text-ink">
        {children}
      </h2>
      {aside && <span className="text-sm text-ink-3 tabular-nums">{aside}</span>}
    </div>
  );
}

/** Stavba nemá souřadnice: kdo stojí na místě, uloží je jedním klepnutím. */
function SaveSiteButton({ onSave }: { onSave: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await onSave();
        setBusy(false);
      }}
      className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface text-base font-medium text-ink active:bg-concrete disabled:opacity-60"
    >
      <Crosshair className="size-4" /> {busy ? t('Zjišťuji polohu…') : t('Jsem na stavbě – uložit její polohu')}
    </button>
  );
}

export function WorkerJobView(p: Props) {
  const { job, myTimer, members, myUid } = p;
  const runningHere = myTimer?.jobId === job.id ? myTimer : null;
  const locked = job.status === 'awaiting_approval' || job.status === 'approved' || job.status === 'invoiced';
  const [extraOpen, setExtraOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const stages = job.stages ?? [];
  /** Na které etapě se pracuje: běžící měření, jinak první nedokončená. */
  const [stageSel, setStageSel] = useState<string | null>(runningHere?.stageId ?? stages.find((s) => !s.doneAt)?.id ?? null);
  const activeStage = runningHere?.stageId ?? stageSel;

  const checklist = checklistOf(job);
  const done = checklist.filter((i) => i.doneAt).length;
  const extras = extraWorkOf(job);

  return (
    <motion.main
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 420, damping: 42 }}
      className="fixed inset-0 z-30 overflow-y-auto bg-concrete"
    >
      <div className="mx-auto max-w-md px-4 pt-4 pb-28">
        <button type="button" onClick={p.onBack} className="-ml-2 flex h-12 items-center gap-1.5 rounded-xl px-2 text-base font-medium text-ink-2 active:bg-surface">
          <ArrowLeft className="size-5" /> {t('Moje zakázky')}
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
            href={mapyNavigationUrl(job)}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-base font-medium text-ink active:bg-concrete"
          >
            <Navigation className="size-4" /> {t('Navigovat (Mapy.cz)')}
          </a>
          <a
            href={job.client.phone ? `tel:${job.client.phone.replace(/\s/g, '')}` : undefined}
            aria-disabled={!job.client.phone}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-base font-medium active:bg-concrete ${
              job.client.phone ? 'text-ink' : 'pointer-events-none text-ink-3'
            }`}
          >
            <Phone className="size-4" /> {t('Zavolat klientovi')}
          </a>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          <span>{t('Jiná navigace:')}</span>
          <a href={navUrls(job).google} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center font-medium text-series-1 underline-offset-2 active:underline">
            Google Maps
          </a>
          <a href={navUrls(job).waze} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center font-medium text-series-1 underline-offset-2 active:underline">
            Waze
          </a>
        </p>
        {!job.client.geo && p.onSaveSite && !locked && <SaveSiteButton onSave={p.onSaveSite} />}

        {locked ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-warn/12 p-4 text-warn-ink">
            <Clock3 className="mt-0.5 size-5 shrink-0" />
            <p className="text-base">
              {job.status === 'awaiting_approval'
                ? t('Předáno ke schválení. Čeká se na majitele, nic dalšího tu nemusíte dělat.')
                : t('Zakázka je schválená a uzavřená.')}
              {job.handover && (
                <span className="mt-1 block text-sm">
                  {job.handover.signature ? t('Převzal(a) {name} s podpisem.', { name: job.handover.clientName }) : t('Předáno bez podpisu zákazníka.')}
                </span>
              )}
            </p>
          </div>
        ) : (
          <>
            <section className="mt-6" aria-label={t('Měření času')}>
              <TimerButton
                running={runningHere}
                switching={Boolean(myTimer && !runningHere)}
                onStart={() => p.onStart(stages.length ? activeStage : null)}
                onStop={p.onStop}
                onPause={p.onPause}
                onResume={p.onResume}
              />
            </section>

            {stages.length > 0 ? (
              <section className="mt-8" aria-labelledby="stages-h">
                <SectionTitle id="stages-h" aside={t('hotovo {p} %', { p: job.progressPct })}>
                  {t('Etapy')}
                </SectionTitle>
                <ol className="mt-2 space-y-2">
                  {stages.map((st) => {
                    const working = activeStage === st.id;
                    return (
                      <li key={st.id} className={`rounded-2xl border bg-surface p-3 ${working ? 'border-ink' : 'border-line'}`}>
                        <button
                          type="button"
                          aria-pressed={working}
                          onClick={() => {
                            buzz();
                            setStageSel(st.id);
                            if (runningHere && runningHere.stageId !== st.id) p.onSwitchStage(st.id);
                          }}
                          className="flex min-h-11 w-full items-center gap-2 text-left"
                        >
                          <span className={`grid size-7 shrink-0 place-items-center rounded-full ${st.doneAt ? 'bg-good text-white' : working ? 'bg-ink text-white' : 'bg-concrete text-ink-3'}`}>
                            {st.doneAt ? <Check className="size-4" strokeWidth={3} /> : <Hammer className="size-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1 text-base font-semibold text-ink">{st.name}</span>
                          {working && <span className="text-sm font-medium text-ink-2">{runningHere ? t('měřím sem') : t('pracuji na této')}</span>}
                        </button>
                        <div className="mt-2 grid grid-cols-5 gap-1" role="radiogroup" aria-label={t('Dokončenost etapy {name}', { name: st.name })}>
                          {STEPS.map((pct) => {
                            const on = st.progressPct === pct;
                            return (
                              <button
                                key={pct}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => {
                                  buzz();
                                  p.onStageProgress(st.id, pct);
                                }}
                                className={`h-11 rounded-lg text-sm font-semibold tabular-nums transition active:scale-95 ${on ? 'bg-ink text-white' : 'border border-line text-ink-2'}`}
                              >
                                {pct} %
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : (
            <section className="mt-8" aria-labelledby="progress-h">
              <SectionTitle id="progress-h" aside={!STEPS.includes(job.progressPct) ? t('nyní {p} %', { p: job.progressPct }) : undefined}>
                {t('Kolik je hotovo?')}
              </SectionTitle>
              <div className="mt-3 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={t('Dokončenost')}>
                {STEPS.map((pct) => {
                  const active = job.progressPct === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        buzz();
                        p.onProgress(pct);
                      }}
                      className={`relative h-14 rounded-xl text-base font-semibold tabular-nums transition active:scale-95 ${
                        active ? 'text-white' : 'border border-line bg-surface text-ink-2'
                      }`}
                    >
                      {active && <motion.span layoutId="progress-pill" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                      <span className="relative">{pct} %</span>
                    </button>
                  );
                })}
              </div>
            </section>
            )}

            {/* Kontrolní seznam */}
            <section className="mt-8" aria-labelledby="check-h">
              <SectionTitle id="check-h" aside={t('{a} z {b}', { a: done, b: checklist.length })}>
                {t('Kontrolní seznam')}
              </SectionTitle>
              <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
                {checklist.map((item) => {
                  const isDone = Boolean(item.doneAt);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isDone}
                        onClick={() => {
                          buzz();
                          p.onToggleCheck(item.id);
                        }}
                        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-concrete"
                      >
                        <motion.span
                          animate={{ scale: isDone ? [1, 1.15, 1] : 1 }}
                          transition={{ duration: 0.25 }}
                          className={`grid size-7 shrink-0 place-items-center rounded-lg border-2 ${isDone ? 'border-good bg-good text-white' : 'border-line'}`}
                        >
                          {isDone && <Check className="size-4" strokeWidth={3} />}
                        </motion.span>
                        <span className={`min-w-0 flex-1 text-base ${isDone ? 'text-ink-3 line-through' : 'text-ink'}`}>
                          {item.text}
                          {item.required && !isDone && <span className="ml-1.5 text-sm font-medium text-crit-ink">{t('povinné')}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Materiál */}
            <section className="mt-8" aria-labelledby="mat-h">
              <SectionTitle id="mat-h" aside={t('vydáno / plán')}>
                {t('Materiál')}
              </SectionTitle>
              {job.materialPlan.length > 0 && (
                <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
                  {job.materialPlan.map((l) => {
                    const over = l.usedQty > l.plannedQty;
                    return (
                      <li key={l.materialId} className="flex items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1 text-base text-ink">{l.name}</span>
                        <span className={`text-base tabular-nums ${over ? 'font-semibold text-crit-ink' : 'text-ink-2'}`}>
                          {l.plannedQty === 0 ? t('{q} {u}, mimo plán', { q: fmt.num(l.usedQty), u: l.unit }) : `${fmt.num(l.usedQty)} / ${fmt.num(l.plannedQty)} ${l.unit}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                onClick={p.onOpenMaterial}
                className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-ink bg-surface text-base font-semibold text-ink transition active:scale-[0.98]"
              >
                <Package className="size-5" /> {t('Vydat nebo vrátit materiál')}
              </button>
            </section>

            {/* Vícepráce */}
            <section className="mt-8" aria-labelledby="extra-h">
              <SectionTitle id="extra-h">{t('Vícepráce')}</SectionTitle>
              {extras.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {extras.map((e) => (
                    <li key={e.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                      <p className="text-base text-ink">{e.description}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${EXTRA_STATUS[e.status].cls}`}>{EXTRA_STATUS[e.status].label()}</span>
                        {e.hours.toLocaleString(localeOf())} h{e.materialCost > 0 && t(', materiál {c}', { c: fmt.czk(e.materialCost) })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setExtraOpen(true)}
                className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-base font-medium text-ink-2 active:bg-surface"
              >
                <Wrench className="size-5" /> {t('Zákazník chce něco navíc')}
              </button>
            </section>
          </>
        )}

        {/* Fotky jdou přidávat i po předání – např. dodatečně nafocené detaily. */}
        <WorkerPhotos photos={p.photos} members={members} myUid={myUid} onAdd={p.onAddPhotos} onDelete={p.onDeletePhoto} onTag={p.onTagPhoto} />

        <section className="mt-8" aria-labelledby="notes-h">
          <SectionTitle id="notes-h">{t('Zprávy')}</SectionTitle>
          <div className="mt-2">
            <NotesThread notes={p.notes} members={members} myUid={myUid} onSend={p.onSendNote} variant="touch" />
          </div>
        </section>
      </div>

      {!locked && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              onClick={() => {
                buzz();
                setHandoverOpen(true);
              }}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-concrete text-base font-semibold text-ink transition active:scale-[0.98]"
            >
              <Check className="size-5" /> {t('Hotovo, předat ke schválení')}
            </button>
          </div>
        </div>
      )}

      <ExtraWorkSheet
        open={extraOpen}
        onClose={() => setExtraOpen(false)}
        onSubmit={(input) => {
          p.onAddExtra(input);
          setExtraOpen(false);
        }}
      />
      <HandoverSheet
        job={job}
        photoCount={p.photos.length}
        open={handoverOpen}
        onClose={() => setHandoverOpen(false)}
        onSubmit={(h) => {
          setHandoverOpen(false);
          p.onSubmit(h);
        }}
      />
    </motion.main>
  );
}
