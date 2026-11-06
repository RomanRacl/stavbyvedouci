'use client';

import { useEffect, useRef } from 'react';

export const PARAM_EVENT = 'stavbyvedouci:param';

const readParams = () => {
  const q = window.location.search || (window.location.hash.includes('?') ? `?${window.location.hash.split('?')[1]}` : '');
  return new URLSearchParams(q);
};

/**
 * Reaguje na parametr v adrese (`?tab=…`, `?open=…`) – odkazy z upozornění a rychlého hledání
 * tak vedou rovnou na správné místo. Když je stránka už otevřená, pošle hodnotu událost PARAM_EVENT.
 */
export function useParamAction(name: string, fn: (value: string) => void) {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    const v = readParams().get(name);
    if (v) cb.current(v);
    const on = (e: Event) => {
      const d = (e as CustomEvent<Record<string, string>>).detail;
      if (d?.[name]) cb.current(d[name]);
    };
    window.addEventListener(PARAM_EVENT, on);
    return () => window.removeEventListener(PARAM_EVENT, on);
  }, [name]);
}

/** Otevře záložku stránky podle `?tab=`. */
export function useTabParam<T extends string>(valid: readonly T[], set: (t: T) => void) {
  useParamAction('tab', (v) => (valid as readonly string[]).includes(v) && set(v as T));
}

/** Po přechodu na odkaz s parametry je rozešle i na už otevřenou stránku. */
export function announceParams(href: string) {
  const params = Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''));
  if (Object.keys(params).length) setTimeout(() => window.dispatchEvent(new CustomEvent(PARAM_EVENT, { detail: params })), 80);
}
