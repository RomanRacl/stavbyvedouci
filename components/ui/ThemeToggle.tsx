'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePref } from '@/lib/theme';

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemePref, string> = { system: 'Podle systému', light: 'Světlý režim', dark: 'Tmavý režim' };
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** Přepínač vzhledu: podle systému → světlý → tmavý. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [pref, setPref] = useTheme();
  const Icon = ICON[pref];
  return (
    <button
      type="button"
      onClick={() => setPref(NEXT[pref])}
      aria-label={`Vzhled: ${LABEL[pref]}. Přepnout na ${LABEL[NEXT[pref]]}.`}
      title={LABEL[pref]}
      className={`grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 transition hover:text-ink ${className}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={pref} initial={{ rotate: -60, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 60, opacity: 0 }} transition={{ duration: 0.18 }}>
          <Icon className="size-4" />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
