'use client';

import { motion } from 'framer-motion';
import { Mic, MicOff } from 'lucide-react';
import { useDictation } from '@/lib/useDictation';

/** Tlačítko mikrofonu: diktovaný text připojí k poli. Kde prohlížeč diktování neumí, nezobrazí se. */
export function DictateButton({ onText, size = 'touch' }: { onText: (t: string) => void; size?: 'touch' | 'desktop' }) {
  const d = useDictation(onText);
  if (!d.supported) return null;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={d.listening ? d.stop : d.start}
        aria-pressed={d.listening}
        aria-label={d.listening ? 'Zastavit diktování' : 'Diktovat hlasem'}
        className={`relative grid shrink-0 place-items-center rounded-xl transition active:scale-95 ${size === 'touch' ? 'size-12' : 'size-10'} ${
          d.listening ? 'bg-crit text-white' : 'border border-line bg-surface text-ink-2'
        }`}
      >
        {d.listening && <motion.span className="absolute inset-0 rounded-xl bg-crit" animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.25, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />}
        <span className="relative">{d.listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}</span>
      </button>
      {d.error && <span className="absolute bottom-full right-0 mb-1 w-56 rounded-md bg-ink px-2 py-1 text-xs text-white">{d.error}</span>}
    </span>
  );
}
