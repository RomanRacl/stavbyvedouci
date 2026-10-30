'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Coffee, Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { workedMs } from '@/lib/jobDefaults';
import type { ActiveTimer } from '@/types/firestore';

interface Props {
  /** Měření běžící právě na této zakázce, jinak null. */
  running: ActiveTimer | null;
  /** Běží měření na jiné zakázce? Pak start práci přepne. */
  switching: boolean;
  disabled?: boolean;
  onStart: () => void;
  /** `endAt` = oprava zapomenutého časovače. */
  onStop: (endAt?: Date) => void;
  onPause: () => void;
  onResume: () => void;
}

/** Po kolika odpracovaných hodinách nebo od kolika hodin večer se ptáme, jestli časovač nezůstal zapnutý omylem. */
const FORGOT_AFTER_H = 10;
const FORGOT_FROM_HOUR = 19;

function fmtDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const timeOf = (d: Date) => d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Návrh konce pro zapomenutý časovač: obvyklý konec směny, nejdřív hodinu po startu. */
function suggestedEnd(t: ActiveTimer) {
  const d = new Date(t.startedAt);
  d.setHours(16, 30, 0, 0);
  const min = t.startedAt.getTime() + 60 * 60_000;
  return new Date(Math.min(Date.now(), Math.max(d.getTime(), min)));
}

/**
 * Hlavní ovládací prvek dělníka – jedno klepnutí, okamžitá změna.
 * Klid: tmavé „Začít práci“. Běží: panel s časem, „Přestávka“ a žluté „Ukončit“.
 */
export function TimerButton({ running, switching, disabled, onStart, onStop, onPause, onResume }: Props) {
  const now = useTick(Boolean(running));
  const [fixing, setFixing] = useState(false);
  const [endTime, setEndTime] = useState('16:30');

  const paused = Boolean(running?.pausedAt);
  const worked = running ? workedMs(running, now) : 0;
  const forgot =
    running && !paused && (worked > FORGOT_AFTER_H * 3_600_000 || new Date(now).getHours() >= FORGOT_FROM_HOUR || new Date(now).toDateString() !== running.startedAt.toDateString());

  useEffect(() => {
    if (running && forgot) setEndTime(timeOf(suggestedEnd(running)));
  }, [running, forgot]);

  const stopAt = () => {
    if (!running) return;
    const [h, m] = endTime.split(':').map(Number);
    const d = new Date(running.startedAt);
    d.setHours(h, m, 0, 0);
    if (d < running.startedAt) d.setDate(d.getDate() + 1); // přes půlnoc
    setFixing(false);
    onStop(d);
  };

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {running ? (
        <motion.div
          key="running"
          layout
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 36 }}
          className="relative overflow-hidden rounded-2xl bg-ink p-5 text-white"
        >
          <span className={`absolute inset-x-0 top-0 h-1.5 ${paused ? 'bg-white/30' : 'hazard'}`} aria-hidden />
          <p className="flex items-center gap-2 text-sm text-white/70">
            {paused ? (
              <>
                <Coffee className="size-4" /> Přestávka od {timeOf(running.pausedAt!)}
              </>
            ) : (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-safety opacity-70 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2 rounded-full bg-safety" />
                </span>
                Měřím čas od {timeOf(running.startedAt)}
              </>
            )}
          </p>
          <p
            className={`mt-1 font-display text-5xl leading-none font-semibold tracking-tight tabular-nums ${paused ? 'text-white/50' : ''}`}
            role="timer"
          >
            {fmtDuration(worked)}
          </p>
          {(running.pausedMs ?? 0) > 60_000 && (
            <p className="mt-1 text-sm text-white/60">přestávky {Math.round((running.pausedMs ?? 0) / 60000)} min se nepočítají</p>
          )}

          {forgot && !fixing && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-safety/15 p-3 text-[15px]">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-safety" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Neběží čas zbytečně?</p>
                <p className="text-white/70">Pokud jste zapomněl ukončit, zapište skutečný konec.</p>
                <button type="button" onClick={() => setFixing(true)} className="mt-2 h-11 rounded-lg bg-safety px-4 font-semibold text-[#16202a] active:scale-[0.98]">
                  Zadat konec práce
                </button>
              </div>
            </div>
          )}

          {fixing ? (
            <div className="mt-4 rounded-xl bg-white/10 p-3">
              <label className="block text-[15px]">
                Skončil jsem v
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1.5 block h-12 w-full rounded-lg bg-[#fff] px-3 font-display text-xl text-[#16202a] tabular-nums"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setFixing(false)} className="h-12 rounded-lg bg-white/10 font-medium">
                  Zpět
                </button>
                <button type="button" onClick={stopAt} className="h-12 rounded-lg bg-safety font-semibold text-[#16202a]">
                  Zapsat a ukončit
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-[1fr_1.6fr] gap-2">
              <button
                type="button"
                onClick={paused ? onResume : onPause}
                className="flex h-16 items-center justify-center gap-2 rounded-xl bg-white/12 text-base font-semibold transition active:scale-[0.98]"
              >
                {paused ? <Play className="size-5 fill-current" /> : <Coffee className="size-5" />}
                {paused ? 'Pokračovat' : 'Přestávka'}
              </button>
              <button
                type="button"
                onClick={() => onStop()}
                className="flex h-16 items-center justify-center gap-2.5 rounded-xl bg-safety text-lg font-bold text-[#16202a] transition active:scale-[0.98]"
              >
                <Square className="size-5 fill-current" /> Ukončit
              </button>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.button
          key="idle"
          layout
          type="button"
          disabled={disabled}
          onClick={onStart}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          whileTap={{ scale: 0.98 }}
          className="flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-ink text-lg font-bold text-white disabled:bg-line disabled:text-ink-3"
        >
          <Play className="size-5 fill-current" />
          {switching ? 'Přepnout sem a začít' : 'Začít práci'}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
