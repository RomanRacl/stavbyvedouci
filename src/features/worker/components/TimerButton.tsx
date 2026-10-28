'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Play, Square } from 'lucide-react';
import type { ActiveTimer } from '@/types/firestore';
import { useElapsed } from '../hooks/useWorkerData';

interface Props {
  /** Měření běžící právě na této zakázce, jinak null. */
  running: ActiveTimer | null;
  /** Běží měření na jiné zakázce? Pak start práci přepne. */
  switching: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

/**
 * Hlavní ovládací prvek dělníka – jedno klepnutí, okamžitá změna.
 * Klidový stav: tmavé tlačítko „Začít práci“. Běží: tmavý panel s časem a žluté „Ukončit“.
 */
export function TimerButton({ running, switching, disabled, onStart, onStop }: Props) {
  const elapsed = useElapsed(running?.startedAt ?? null);

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
          <span className="hazard absolute inset-x-0 top-0 h-1.5" aria-hidden />
          <p className="flex items-center gap-2 text-sm text-white/70">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-safety opacity-70 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-safety" />
            </span>
            Měřím čas od {running.startedAt.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="mt-1 font-display text-5xl leading-none font-semibold tracking-tight tabular-nums" role="timer">
            {elapsed}
          </p>
          <button
            type="button"
            onClick={onStop}
            className="mt-5 flex h-16 w-full items-center justify-center gap-2.5 rounded-xl bg-safety text-lg font-bold text-ink transition active:scale-[0.98]"
          >
            <Square className="size-5 fill-current" /> Ukončit práci
          </button>
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
