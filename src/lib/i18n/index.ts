'use client';

import { useEffect, useState } from 'react';
import { DICT } from './dict';

/**
 * Jazyky mobilní aplikace pro partu. Klíčem překladu je český text, takže kód zůstává čitelný
 * a chybějící překlad se jen zobrazí česky. Zástupná pole: t('Zapsáno {km} km.', { km: 42 }).
 */
export type Lang = 'cs' | 'en' | 'uk';

export const LANGS: Array<{ id: Lang; label: string; short: string; speech: string; locale: string }> = [
  { id: 'cs', label: 'Čeština', short: 'CZ', speech: 'cs-CZ', locale: 'cs-CZ' },
  { id: 'en', label: 'English', short: 'EN', speech: 'en-GB', locale: 'en-GB' },
  { id: 'uk', label: 'Українська', short: 'UA', speech: 'uk-UA', locale: 'uk-UA' },
];

const KEY = 'stavbyvedouci:lang';
const EVENT = 'stavbyvedouci:lang';
let current: Lang = 'cs';

function stored(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en' || v === 'uk' || v === 'cs') return v;
  } catch {
    /* soukromé okno */
  }
  return 'cs';
}

export const getLang = () => current;
export const localeOf = (l: Lang = current) => LANGS.find((x) => x.id === l)!.locale;
export const speechLang = (l: Lang = current) => LANGS.find((x) => x.id === l)!.speech;

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* nic */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  window.dispatchEvent(new Event(EVENT));
}

/** Přeloží český text do aktuálního jazyka a doplní zástupná pole. */
export function t(cs: string, vars?: Record<string, string | number>): string {
  const row = current === 'cs' ? null : DICT[cs];
  let s = row ? (current === 'en' ? row[0] : row[1]) || cs : cs;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}

/**
 * Jazyk v komponentě: při změně se vrátí nová hodnota, takže se strom překreslí.
 * Volá se v kořeni mobilní aplikace (a v komponentách mimo ni, které potřebují překlad).
 */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, set] = useState<Lang>(current);
  useEffect(() => {
    const s = stored();
    if (s !== current) {
      current = s;
      document.documentElement.lang = s;
    }
    set(current);
    const on = () => set(current);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [lang, setLang];
}

/** Zpět na češtinu (např. při odchodu z mobilní části do kanceláře). */
export function resetLangForOffice() {
  if (current !== 'cs') {
    current = 'cs';
    if (typeof document !== 'undefined') document.documentElement.lang = 'cs';
  }
}
