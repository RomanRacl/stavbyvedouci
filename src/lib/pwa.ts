'use client';

import { useEffect, useState } from 'react';

/**
 * Instalace aplikace na plochu telefonu.
 * Android/Chrome pošle událost `beforeinstallprompt` – schováme si ji a nabídneme vlastní tlačítko.
 * iPhone nic takového nemá, tam se ukáže krátký návod (Sdílet → Přidat na plochu).
 */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const EVENT = 'stavbyvedouci:install';
const HIDE_KEY = 'stavbyvedouci:install-hidden';

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    window.dispatchEvent(new Event(EVENT));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    window.dispatchEvent(new Event(EVENT));
  });
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

export type InstallMode = 'prompt' | 'ios' | null;

/** Jak (a jestli vůbec) nabídnout instalaci. `hide` kartu schová natrvalo. */
export function useInstall(): { mode: InstallMode; install: () => Promise<boolean>; hide: () => void } {
  const [mode, setMode] = useState<InstallMode>(null);
  useEffect(() => {
    const update = () => {
      let hidden = false;
      try {
        hidden = localStorage.getItem(HIDE_KEY) === '1';
      } catch {
        /* soukromé okno */
      }
      if (hidden || isStandalone()) setMode(null);
      else if (deferred) setMode('prompt');
      else if (isIos()) setMode('ios');
      else setMode(null);
    };
    update();
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);

  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* nic */
    }
    setMode(null);
  };
  const install = async () => {
    if (!deferred) return false;
    const p = deferred;
    deferred = null;
    await p.prompt();
    const { outcome } = await p.userChoice;
    setMode(null);
    return outcome === 'accepted';
  };
  return { mode, install, hide };
}

/** Je telefon online? Mění se s výpadkem signálu. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  return online;
}
