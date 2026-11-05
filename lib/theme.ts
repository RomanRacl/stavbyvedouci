'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'stavbyvedouci:theme';
const GLOVES = 'stavbyvedouci:gloves';

/**
 * Skript do <head>, který nastaví téma ještě před prvním vykreslením –
 * bez něj by tmavý režim při načtení probliknul světlým.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`;

function apply(pref: ThemePref) {
  const el = document.documentElement;
  if (pref === 'system') delete el.dataset.theme;
  else el.dataset.theme = pref;
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>('system');
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === 'light' || t === 'dark') setPref(t);
    } catch {
      /* soukromé okno */
    }
  }, []);
  const set = useCallback((next: ThemePref) => {
    setPref(next);
    apply(next);
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* nic */
    }
  }, []);
  return [pref, set] as const;
}

/** Režim pro rukavice: větší písmo a dotykové plochy v mobilu dělníka. Platí jen na stránce dělníka. */
export function useGloves() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let initial = false;
    try {
      initial = localStorage.getItem(GLOVES) === 'on';
    } catch {
      /* nic */
    }
    setOn(initial);
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    if (on) el.dataset.gloves = 'on';
    else delete el.dataset.gloves;
    return () => {
      delete el.dataset.gloves;
    };
  }, [on]);
  const toggle = useCallback(() => {
    setOn((v) => {
      try {
        localStorage.setItem(GLOVES, v ? 'off' : 'on');
      } catch {
        /* nic */
      }
      return !v;
    });
  }, []);
  return [on, toggle] as const;
}
