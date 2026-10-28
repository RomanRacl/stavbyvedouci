'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSnapshot, type Snapshot } from '@/lib/mock/localBackend';
import { subscribeStore } from '@/lib/mock/localStore';

const WORKER_KEY = 'stavbyvedouci:worker';

/** Data pro mobil dělníka – stejný zdroj jako dashboard, změny se propisují živě. */
export function useWorkerData() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    const pull = () => setSnap(getSnapshot());
    pull();
    return subscribeStore(pull);
  }, []);
  return snap;
}

/**
 * Kdo je přihlášený. Do zapojení Firebase Auth si dělník vybere sám sebe
 * a volba se pamatuje v tomto telefonu.
 */
export function useCurrentWorker() {
  const [uid, setUid] = useState<string | null | undefined>(undefined); // undefined = ještě nenačteno
  useEffect(() => {
    try {
      setUid(localStorage.getItem(WORKER_KEY));
    } catch {
      setUid(null);
    }
  }, []);
  const choose = useCallback((next: string | null) => {
    try {
      if (next) localStorage.setItem(WORKER_KEY, next);
      else localStorage.removeItem(WORKER_KEY);
    } catch {
      /* úložiště nedostupné – volba platí do zavření stránky */
    }
    setUid(next);
  }, []);
  return [uid, choose] as const;
}

/** Uplynulý čas od `since`, obnovuje se každou sekundu. */
export function useElapsed(since: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return '0:00:00';
  const total = Math.max(0, Math.floor((now - since.getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Krátké zavibrování jako potvrzení klepnutí (kde to telefon umí). */
export const buzz = () => {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* nic */
  }
};
