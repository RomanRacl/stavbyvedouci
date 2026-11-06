'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, ChevronRight, Hand, MapPin, Mic, Play, SunMedium } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { StatusPill } from '@/components/ui/StatusPill';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import {
  addExtraWork,
  addNote,
  addPhotos,
  confirmDay,
  deletePhoto,
  issueMaterial,
  pauseWork,
  resumeWork,
  returnMaterial,
  confirmSafety,
  setStageProgress,
  switchStage,
  setPhotoTag,
  setJobSite,
  setProgress,
  setTimerGeo,
  startWork,
  stopWork,
  submitForApproval,
  toggleChecklistItem,
} from '@/lib/mock/localBackend';
import { dayKey } from '@/lib/jobDefaults';
import { stockAt, vanOf } from '@/lib/stock';
import { needsSafety } from '@/lib/operations';
import { useGloves, useSun } from '@/lib/theme';
import { useVoiceSupported, VoiceSheet } from './components/VoiceCommand';
import type { VoiceCommand } from '@/lib/voiceCommands';
import { LANGS, localeOf, t, useLang } from '@/lib/i18n';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SafetySheet } from './components/SafetySheet';
import type { Job } from '@/types/firestore';
import { DayReportSheet } from './components/DayReportSheet';
import { MaterialSheet } from './components/MaterialSheet';
import { TimerButton } from './components/TimerButton';
import { WorkerJobView } from './components/WorkerJobView';
import { WorkerPicker } from './components/WorkerPicker';
import { MoreSheets, MoreTiles, type MoreKind } from './components/MoreSheets';
import { InstallCard, OfflineBanner } from './components/FieldBanners';
import { fmtDistance, fmtGeo, geoCheckOn, geoVerdict, getPosition, photoStampOn, siteRadius } from '@/lib/geo';
import { buzz, useCurrentWorker, useWorkerData } from './hooks/useWorkerData';

const ACTIVE = new Set<Job['status']>(['scheduled', 'in_progress']);

const formatMinutes = (min: number) => (min >= 60 ? t('{h} h {m} min', { h: Math.floor(min / 60), m: min % 60 }) : t('{m} min', { m: min }));

/** Termín zakázky lidsky: „dnes“, „zítra“, nebo datum. */
function whenLabel(job: Job) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = day(new Date());
  const start = day(job.schedule.start);
  const due = day(job.schedule.due);
  if (start <= today && due >= today) return t('běží do {d}', { d: fmt.date(job.schedule.due) });
  if (start === today + 86_400_000) return t('začíná zítra');
  if (start > today) return t('začíná {d}', { d: fmt.date(job.schedule.start) });
  return t('termín {d}', { d: fmt.date(job.schedule.due) });
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
            <Play className="size-4 fill-current" /> {canStart ? t('Začít práci') : t('Přepnout sem a začít')}
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
  const [dayOpen, setDayOpen] = useState(false);
  const [more, setMore] = useState<MoreKind | null>(null);
  const [safetyFor, setSafetyFor] = useState<{ job: Job; stageId: string | null } | null>(null);
  const [gloves, toggleGloves] = useGloves();
  const [sun, toggleSun] = useSun();
  const voiceOk = useVoiceSupported();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [lang, changeLang] = useLang();

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
  if (!uid || !me) return <WorkerPicker key={lang} members={snap.members} onPick={setUid} lang={lang} onLang={changeLang} />;

  /* ---------- akce: okamžitý zápis + potvrzení vibrací a toastem ---------- */

  const start = (job: Job, stageId: string | null = job.stages?.find((s) => !s.doneAt)?.id ?? null, confirmed = false) => {
    buzz();
    // Na novou stavbu nejdřív poučení BOZP – jednou na zakázku.
    if (!confirmed && needsSafety(job, me.uid)) {
      setSafetyFor({ job, stageId });
      return;
    }
    const { stoppedJob, stoppedMinutes } = startWork(me.uid, job.id, stageId);
    // Poloha se zjišťuje až po startu – práce se zapíše hned, i když GPS chvíli trvá nebo není povolená.
    if (geoCheckOn(snap.settings)) {
      void getPosition().then((pos) => {
        if (!pos) return;
        setTimerGeo(me.uid, job.id, pos.geo, pos.accuracy);
        const v = geoVerdict(pos.geo, job.client.geo, pos.accuracy, siteRadius(snap.settings));
        if (v.kind === 'away') say(t('Pozor: telefon je {d} od stavby. Kancelář to uvidí u záznamu.', { d: fmtDistance(v.distance) }), 'error');
      });
    }
    say(
      stoppedJob
        ? t('Ukončeno na {a} ({m}), měřím na {b}.', { a: stoppedJob.code, m: formatMinutes(stoppedMinutes), b: job.code })
        : t('Měřím čas na {code}.', { code: job.code }),
    );
  };
  const stop = (endAt?: Date) => {
    buzz();
    const { minutes, job } = stopWork(me.uid, endAt);
    if (job) say(t('Zapsáno {m} na {code}.', { m: formatMinutes(minutes), code: job.code }));
  };
  const pause = () => {
    buzz();
    pauseWork(me.uid);
    say(t('Přestávka. Čas se teď nepočítá.'));
  };
  const resume = () => {
    buzz();
    resumeWork(me.uid);
    say(t('Pokračujete, čas se zase měří.'));
  };
  /* ---------- hlasové povely ---------- */
  const onVoice = (c: VoiceCommand) => {
    setVoiceOpen(false);
    // Zakázka, ke které povel patří: otevřená, jinak ta, na které běží čas, jinak jediná rozpracovaná.
    const target = openJob ?? timerJob ?? (active.length === 1 ? active[0] : null);
    switch (c.kind) {
      case 'start':
        if (timer && (!openJob || openJob.id === timer.jobId)) return say(t('Čas už běží na {code}.', { code: timerJob?.code ?? '' }));
        if (!target) return say(t('Otevřete zakázku a řekněte „začít“ znovu.'), 'error');
        return start(target);
      case 'stop':
        return timer ? stop() : say(t('Teď se žádný čas neměří.'), 'error');
      case 'pause':
        return timer && !timer.pausedAt ? pause() : say(t('Teď se žádný čas neměří.'), 'error');
      case 'resume':
        return timer?.pausedAt ? resume() : say(t('Přestávka neběží.'), 'error');
      case 'note':
        if (!target) return say(t('Otevřete zakázku a řekněte poznámku znovu.'), 'error');
        addNote(me.uid, target.id, c.text);
        buzz();
        return say(t('Poznámka uložena na {code}.', { code: target.code }));
      case 'material':
        if (!target) return say(t('Otevřete zakázku a řekněte „materiál“ znovu.'), 'error');
        if (!openJob) open(target.id);
        return setMaterialOpen(true);
      case 'photo':
        if (!target) return say(t('Otevřete zakázku a řekněte „fotka“ znovu.'), 'error');
        if (!openJob) open(target.id);
        // Fotoaparát smí otevřít jen klepnutí – posuneme k tlačítku a zvýrazníme ho.
        setTimeout(() => window.dispatchEvent(new Event('stavbyvedouci:photo')), 350);
        return say(t('Klepněte na Vyfotit.'));
    }
  };

  const today = dayKey();
  const dayConfirmedAt = snap.dayReports[`${me.uid}_${today}`] ?? null;
  const myLogs = snap.timeLogs.filter((l) => l.workerId === me.uid);
  const myVan = vanOf(snap.vans, me.uid);
  const vanStock = myVan
    ? Object.fromEntries(snap.catalog.map((c) => [c.id, stockAt(c, snap.stockMoves, `van:${myVan.id}`)]))
    : null;

  return (
    <div key={lang} className="worker-root min-h-dvh bg-concrete">
      <main className="mx-auto max-w-md px-4 pt-6 pb-16">
        <header className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink font-display font-semibold text-white">{me.initials}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-2">{new Date().toLocaleDateString(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="truncate font-display text-xl font-bold text-ink">{me.displayName}</h1>
          </div>
          <ThemeToggle className="size-11 rounded-xl border border-line bg-surface" />
        </header>
        {/* Nástroje: na celou šířku, aby se jméno nemuselo zkracovat a tlačítka šla trefit i v rukavicích. */}
        <div className={`mt-4 grid gap-2 ${voiceOk ? 'grid-cols-[1fr_auto_auto_auto]' : 'grid-cols-[1fr_auto_auto]'}`}>
          <button
            type="button"
            onClick={() => setDayOpen(true)}
            className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-base font-medium text-ink active:bg-concrete"
          >
            <CalendarClock className="size-5" /> {t('Můj den')}
          </button>
          {voiceOk && (
            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              aria-label={t('Hlasový povel')}
              title={t('Hlasový povel')}
              className="grid size-12 place-items-center rounded-xl border border-line bg-surface text-ink active:bg-concrete"
            >
              <Mic className="size-5" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleGloves}
            aria-pressed={gloves}
            aria-label={gloves ? t('Vypnout režim pro rukavice') : t('Zapnout režim pro rukavice (větší tlačítka)')}
            className={`grid size-12 place-items-center rounded-xl border ${gloves ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2'}`}
          >
            <Hand className="size-5" />
          </button>
          <button
            type="button"
            onClick={toggleSun}
            aria-pressed={sun}
            aria-label={sun ? t('Vypnout režim na slunce') : t('Zapnout režim na slunce (vysoký kontrast)')}
            className={`grid size-12 place-items-center rounded-xl border ${sun ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2'}`}
          >
            <SunMedium className="size-5" />
          </button>
        </div>

        <OfflineBanner />

        {/* Běžící měření je vždy nahoře, ať je zakázka otevřená, nebo ne. */}
        <AnimatePresence initial={false}>
          {timer && timerJob && (
            <motion.section
              key="running"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6"
              aria-label={t('Běžící práce')}
            >
              <button type="button" onClick={() => open(timerJob.id)} className="mb-2 flex w-full items-center gap-1 text-left text-base font-semibold text-ink">
                <span className="min-w-0 truncate">{timerJob.title}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-3" />
              </button>
              <TimerButton running={timer} switching={false} onStart={() => undefined} onStop={stop} onPause={pause} onResume={resume} />
            </motion.section>
          )}
        </AnimatePresence>

        <section className="mt-8" aria-labelledby="mine-h">
          <h2 id="mine-h" className="text-base font-semibold text-ink">
            {t('Moje zakázky')}
          </h2>
          {active.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-base text-ink-2">
              {t('Nemáte přiřazenou žádnou zakázku. Až vám ji kancelář přidělí, objeví se tady.')}
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
              {t('Čeká na schválení')}
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

        <InstallCard onInstalled={() => say(t('Aplikace je na ploše.'))} />

        <MoreTiles
          onOpen={setMore}
          badge={{ absence: snap.absences.filter((a) => a.uid === me.uid && a.status === 'pending').length }}
        />

        <button type="button" onClick={() => setUid(null)} className="mx-auto mt-10 block h-11 rounded-xl px-4 text-sm font-medium text-ink-3 active:bg-surface">
          {t('Nejsem {name}, přepnout', { name: me.displayName.split(' ')[0] })}
        </button>
        <div className="mt-2 flex justify-center gap-1" role="radiogroup" aria-label={t('Jazyk')}>
          {LANGS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} lang={l.id} onClick={() => changeLang(l.id)} className={`h-10 rounded-lg px-3 text-sm font-medium ${lang === l.id ? 'bg-ink text-white' : 'text-ink-2 active:bg-surface'}`}>
              {l.label}
            </button>
          ))}
        </div>
        {geoCheckOn(snap.settings) && (
          <p className="mx-auto mt-6 max-w-xs text-center text-xs text-ink-3">{t('Při začátku práce se jednou uloží poloha telefonu. Během dne vás aplikace nesleduje.')}</p>
        )}
      </main>

      <AnimatePresence>
        {openJob && (
          <WorkerJobView
            key={openJob.id}
            job={openJob}
            myTimer={timer}
            onBack={() => open(null)}
            onStart={(stageId) => start(openJob, stageId)}
            onStageProgress={(stageId, pct) => setStageProgress(me.uid, openJob.id, stageId, pct)}
            onSwitchStage={(stageId) => {
              switchStage(me.uid, stageId);
              say(t('Čas se teď měří na etapu {name}.', { name: openJob.stages?.find((s) => s.id === stageId)?.name ?? '' }));
            }}
            onStop={stop}
            onPause={pause}
            onResume={resume}
            onProgress={(p) => setProgress(openJob.id, p, me.uid)}
            onOpenMaterial={() => setMaterialOpen(true)}
            onSubmit={(h) => {
              submitForApproval(me.uid, openJob.id, h);
              say(t('{code} předána ke schválení.', { code: openJob.code }));
              open(null);
            }}
            notes={snap.notes.filter((n) => n.jobId === openJob.id)}
            onSendNote={(text) => addNote(me.uid, openJob.id, text)}
            onSaveSite={async () => {
              const pos = await getPosition(15_000);
              if (!pos) {
                say(t('Polohu se nepodařilo zjistit. Povolte polohu pro tuto stránku a zkuste to venku.'), 'error');
                return;
              }
              setJobSite(me.uid, openJob.id, pos.geo);
              buzz();
              say(t('Poloha stavby uložena. Navigace teď vede přesně sem.'));
            }}
            onToggleCheck={(itemId) => toggleChecklistItem(me.uid, openJob.id, itemId)}
            onAddExtra={(input) => {
              addExtraWork(me.uid, openJob.id, input);
              say(t('Vícepráce odeslána do kanceláře ke schválení.'));
            }}
            onTagPhoto={(p, tag) => setPhotoTag(p.id, tag)}
            photos={snap.photos.filter((p) => p.jobId === openJob.id)}
            members={snap.members}
            myUid={me.uid}
            onAddPhotos={async (files) => {
              const stamp = photoStampOn(snap.settings)
                ? (at: Date) => {
                    const geo = timer?.jobId === openJob.id ? timer.geoStart : null;
                    return [
                      `${openJob.code} · ${openJob.client.address}`,
                      `${at.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${me.displayName}${geo ? ` · ${fmtGeo(geo)}` : ''}`,
                    ];
                  }
                : null;
              const saved = await addPhotos(me.uid, openJob.id, files, stamp);
              if (saved === files.length) say(saved === 1 ? t('Fotka uložena.') : saved < 5 ? t('Uloženy {n} fotky.', { n: saved }) : t('Uloženo {n} fotek.', { n: saved }));
              else if (saved > 0) say(t('Uloženo {n} z {total} fotek. Ostatní se nepodařilo načíst.', { n: saved, total: files.length }), 'error');
              else say(t('Fotku se nepodařilo uložit. Zkuste ji vyfotit znovu.'), 'error');
              return saved;
            }}
            onDeletePhoto={(p) => {
              void deletePhoto(p.id);
              say(t('Fotka smazána.'));
            }}
          />
        )}
      </AnimatePresence>

      <VoiceSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} onCommand={onVoice} />

      {openJob && (
        <MaterialSheet
          job={openJob}
          catalog={snap.catalog}
          vanStock={vanStock}
          vanName={myVan ? `${myVan.name} ${myVan.plate}` : null}
          open={materialOpen}
          onClose={() => setMaterialOpen(false)}
          onSubmit={(items) => {
            issueMaterial(me.uid, openJob.id, items);
            setMaterialOpen(false);
            buzz();
            say(t('Výdej zapsán na {code}.', { code: openJob.code }));
          }}
          onReturn={(items) => {
            returnMaterial(me.uid, openJob.id, items);
            setMaterialOpen(false);
            buzz();
            say(myVan ? t('Vráceno do auta, náklady zakázky sníženy.') : t('Vráceno do skladu, náklady zakázky sníženy.'));
          }}
        />
      )}

      <SafetySheet
        job={safetyFor?.job ?? null}
        open={Boolean(safetyFor)}
        onClose={() => setSafetyFor(null)}
        onConfirm={() => {
          if (!safetyFor) return;
          confirmSafety(me.uid, safetyFor.job.id);
          const { job, stageId } = safetyFor;
          setSafetyFor(null);
          start(job, stageId, true);
        }}
      />

      <MoreSheets open={more} onClose={() => setMore(null)} snap={snap} me={me} say={say} />

      <DayReportSheet
        open={dayOpen}
        onClose={() => setDayOpen(false)}
        logs={myLogs}
        timer={timer}
        jobs={snap.jobs}
        confirmedAt={dayConfirmedAt}
        onConfirm={() => {
          confirmDay(me.uid, today);
          buzz();
          say(t('Výkaz za dnešek je potvrzený.'));
        }}
      />

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
