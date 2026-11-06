'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Reálné fotky na pozadí podle sekce, ve které majitel právě je.
 * Fotka se pomalu přibližuje a posouvá (Ken Burns), při přechodu na jinou sekci se plynule prolne.
 * Obsah zůstává čitelný: přes fotku je závoj v barvě pozadí, nahoře slabší, dole plný.
 *
 * Fotky jsou z Unsplash (licence Unsplash: zdarma i pro komerční použití, bez nutnosti uvádět autora),
 * načítají se přímo z jejich CDN ve velikosti podle obrazovky.
 */
const PHOTOS: Record<string, { id: string; alt: string }> = {
  '/dashboard': { id: '1653280662710-1cac52cde6d7', alt: 'Parta na stavbě' },
  '/kalendar': { id: '1435527173128-983b87201f4d', alt: 'Plánovací diář na stole' },
  '/provoz': { id: '1614620027574-980d7c376daf', alt: 'Dodávka na silnici' },
  '/obchod': { id: '1549923746-c502d488b3ea', alt: 'Podání ruky' },
  '/nabidky': { id: '1721244653652-268631ec049a', alt: 'Výkresy stavby' },
  '/zakaznici': { id: '1716686135669-f342dc43c423', alt: 'Rodinné domy' },
  '/penize': { id: '1707779491435-000c45820db2', alt: 'Kalkulačka a notebook' },
  '/analytika': { id: '1551288049-bebda4e38f71', alt: 'Grafy na obrazovce' },
  '/sklad': { id: '1637241612956-b7309005288b', alt: 'Regál se stavebním materiálem' },
  '/objednavky': { id: '1580674285054-bed31e145f59', alt: 'Krabice v dodávce' },
  '/tym': { id: '1626885930974-4b69aa21bbf9', alt: 'Dva dělníci v reflexních vestách' },
  '/sablony': { id: '1513128034602-7814ccaddd4e', alt: 'Poznámkový blok a pero' },
  '/nastaveni': { id: '1761544775659-aaa6fa2e5b3d', alt: 'Nářadí na stěně dílny' },
};

const url = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=60&w=${w}`;

export const BACKDROP_KEY = 'stavbyvedouci:backdrop';
export const BACKDROP_EVENT = 'stavbyvedouci:backdrop';

/** Zapnuto/vypnuto pro tento prohlížeč. Při úsporném režimu dat je výchozí stav vypnuto. */
export function useBackdropOn(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => {
      let v: string | null = null;
      try {
        v = localStorage.getItem(BACKDROP_KEY);
      } catch {
        /* soukromé okno */
      }
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
      setOn(v === null ? !saveData : v === '1');
    };
    read();
    window.addEventListener(BACKDROP_EVENT, read);
    return () => window.removeEventListener(BACKDROP_EVENT, read);
  }, []);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(BACKDROP_KEY, v ? '1' : '0');
    } catch {
      /* nic */
    }
    window.dispatchEvent(new Event(BACKDROP_EVENT));
  };
  return [on, set];
}

const sectionOf = (path: string) => Object.keys(PHOTOS).find((k) => path === k || path.startsWith(`${k}/`)) ?? '/dashboard';

export function SectionBackdrop({ path }: { path: string }) {
  const [on] = useBackdropOn();
  const reduce = useReducedMotion();
  const section = sectionOf(path);
  const photo = PHOTOS[section];
  // Fotka se ukáže až po načtení, aby se neobjevovala po kouscích.
  const [loaded, setLoaded] = useState<string | null>(null);

  if (!on) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden">
      <AnimatePresence initial={false}>
        <motion.div
          key={section}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: loaded === section ? 1 : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.2 : 1.1, ease: 'easeOut' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- fotky jdou přímo z CDN Unsplash, optimalizace Next by je jen stahovala podruhé */}
          <img
            src={url(photo.id, 1600)}
            srcSet={`${url(photo.id, 900)} 900w, ${url(photo.id, 1600)} 1600w, ${url(photo.id, 2400)} 2400w`}
            sizes="100vw"
            alt=""
            decoding="async"
            onLoad={() => setLoaded(section)}
            className={`size-full object-cover ${reduce ? '' : 'backdrop-kenburns'}`}
          />
        </motion.div>
      </AnimatePresence>
      {/* Závoj: nahoře je fotka víc vidět (za nadpisem), níž ustupuje, aby tabulky a karty zůstaly čitelné. */}
      <div className="absolute inset-0 bg-gradient-to-b from-concrete/72 via-concrete/88 to-concrete/96" />
    </div>
  );
}
