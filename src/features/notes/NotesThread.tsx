'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DictateButton } from '@/components/ui/DictateButton';
import type { JobNote, Member } from '@/types/firestore';

interface Props {
  notes: JobNote[];
  members: Member[];
  myUid: string;
  onSend: (text: string) => void;
  /** `touch` = větší písmo a ovládání pro mobil dělníka. */
  variant?: 'desktop' | 'touch';
}

const stamp = (d: Date) => {
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Zprávy k zakázce mezi kanceláří a partou – místo telefonátů a SMS, které se ztrácí. */
export function NotesThread({ notes, members, myUid, onSend, variant = 'desktop' }: Props) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const touch = variant === 'touch';
  const sorted = [...notes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [sorted.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  const nameOf = (uid: string) => members.find((m) => m.uid === uid);

  return (
    <div>
      {sorted.length === 0 ? (
        <p className={`rounded-lg border border-dashed border-line px-4 py-3 text-ink-2 ${touch ? 'text-base' : 'text-sm'}`}>
          Zatím žádné zprávy. Napište třeba, kde jsou klíče nebo co zákazník chce navíc.
        </p>
      ) : (
        <ol className={`space-y-2 overflow-y-auto ${touch ? 'max-h-96' : 'max-h-80'}`}>
          <AnimatePresence initial={false}>
            {sorted.map((n) => {
              const mine = n.authorId === myUid;
              const author = nameOf(n.authorId);
              const office = author?.role === 'owner' || author?.role === 'manager';
              return (
                <motion.li
                  key={n.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${
                      mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md border border-line bg-surface text-ink'
                    }`}
                  >
                    {!mine && (
                      <p className={`text-xs font-semibold ${office ? 'text-series-1-ink' : 'text-ink-2'}`}>
                        {author?.displayName ?? 'Neznámý'}
                        {office && ', kancelář'}
                      </p>
                    )}
                    <p className={`whitespace-pre-wrap ${touch ? 'text-base' : 'text-sm'}`}>{n.text}</p>
                    <p className={`mt-0.5 text-right text-[11px] tabular-nums ${mine ? 'text-white/60' : 'text-ink-3'}`}>{stamp(n.createdAt)}</p>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
          <div ref={endRef} />
        </ol>
      )}

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Nová zpráva</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (!touch && e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            rows={1}
            placeholder="Napsat zprávu"
            className={`block w-full resize-none rounded-xl border border-line bg-surface px-3 text-ink placeholder:text-ink-3 focus:border-series-1 focus:outline-none ${
              touch ? 'min-h-12 py-3 text-base' : 'min-h-10 py-2 text-sm'
            }`}
          />
        </label>
        <DictateButton size={touch ? 'touch' : 'desktop'} onText={(t) => setText((cur) => (cur ? `${cur} ${t}` : t))} />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Odeslat"
          className={`grid shrink-0 place-items-center rounded-xl bg-ink text-white transition active:scale-95 disabled:bg-line disabled:text-ink-3 ${touch ? 'size-12' : 'size-10'}`}
        >
          <SendHorizontal className="size-5" />
        </button>
      </form>
    </div>
  );
}
