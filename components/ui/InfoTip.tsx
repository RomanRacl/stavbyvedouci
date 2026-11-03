'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

/** Nápověda u metrik a grafů. Otevírá se hoverem i fokusem z klávesnice. */
export function InfoTip({ children, label = 'Co tato hodnota znamená' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="grid size-5 place-items-center rounded-full text-ink-3 transition hover:text-ink focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:outline-none"
      >
        <Info className="size-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
            className="absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-md bg-ink px-3 py-2 text-xs leading-relaxed font-normal text-white shadow-lg"
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
