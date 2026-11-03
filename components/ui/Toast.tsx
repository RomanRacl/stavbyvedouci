'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useEffect } from 'react';

export type ToastMsg = { text: string; tone: 'error' | 'success'; id?: number };

/** Krátké potvrzení akce dole na obrazovce, samo zmizí po 4 s. */
export function Toast({ message, onDone }: { message: ToastMsg | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [message, onDone]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 pb-[env(safe-area-inset-bottom)]"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {message && (
          <motion.div
            key={message.id ?? message.text}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-auto flex max-w-md items-center gap-2 rounded-xl bg-ink px-4 py-3 text-[15px] text-white shadow-xl"
          >
            {message.tone === 'error' ? (
              <AlertCircle className="size-5 shrink-0 text-safety" />
            ) : (
              <CheckCircle2 className="size-5 shrink-0 text-good" />
            )}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
