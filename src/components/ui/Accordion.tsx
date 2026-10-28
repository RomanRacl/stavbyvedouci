'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { createContext, useContext, useId, useState, type ReactNode } from 'react';

interface Ctx {
  openIds: Set<string>;
  toggle: (id: string) => void;
}
const AccordionCtx = createContext<Ctx | null>(null);

/** `multiple=false` = otevřená vždy jen jedna sekce (výchozí pro čisté rozhraní). */
export function Accordion({ children, multiple = false, defaultOpen = [] }: { children: ReactNode; multiple?: boolean; defaultOpen?: string[] }) {
  const [openIds, setOpen] = useState(() => new Set(defaultOpen));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(multiple ? prev : []);
      if (prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <AccordionCtx.Provider value={{ openIds, toggle }}>
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">{children}</div>
    </AccordionCtx.Provider>
  );
}

export function AccordionItem({ id, header, children }: { id: string; header: ReactNode; children: ReactNode }) {
  const ctx = useContext(AccordionCtx);
  const panelId = useId();
  if (!ctx) throw new Error('AccordionItem musí být uvnitř <Accordion>');
  const open = ctx.openIds.has(id);

  return (
    <div className="bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => ctx.toggle(id)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-concrete/60 focus-visible:bg-concrete focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1">{header}</div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-ink-3">
          <ChevronDown className="size-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
