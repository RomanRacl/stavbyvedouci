'use client';

import { motion } from 'framer-motion';
import type { Member } from '@/types/firestore';
import { LANGS, t, type Lang } from '@/lib/i18n';

/** Dočasné „přihlášení“: dělník klepne na své jméno. Po zapojení Firebase Auth odpadne. */
export function WorkerPicker({ members, onPick, lang, onLang }: { members: Member[]; onPick: (uid: string) => void; lang: Lang; onLang: (l: Lang) => void }) {
  const workers = members.filter((m) => m.role !== 'owner' && m.active);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-14 pb-10">
      <div className="mb-6 flex gap-1" role="radiogroup" aria-label={t('Jazyk')}>
        {LANGS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} lang={l.id} onClick={() => onLang(l.id)} className={`h-10 rounded-lg px-3 text-sm font-medium ${lang === l.id ? 'bg-ink text-white' : 'border border-line bg-surface text-ink-2'}`}>
            {l.label}
          </button>
        ))}
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{t('Kdo jste?')}</h1>
      <p className="mt-2 text-base text-ink-2">{t('Klepněte na své jméno. Telefon si vás zapamatuje.')}</p>
      {workers.length === 0 && <p className="mt-8 rounded-2xl border border-dashed border-line p-5 text-base text-ink-2">{t('Zatím tu nikdo není. Majitel přidá lidi v kanceláři v sekci Tým.')}</p>}
      <ul className="mt-8 space-y-3">
        {workers.map((w, i) => (
          <motion.li
            key={w.uid}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i, duration: 0.3 }}
          >
            <button
              type="button"
              onClick={() => onPick(w.uid)}
              className="flex min-h-[72px] w-full items-center gap-4 rounded-2xl border border-line bg-surface px-4 text-left transition active:scale-[0.98] active:bg-concrete"
            >
              <span className="grid size-12 place-items-center rounded-full bg-ink font-display text-lg font-semibold text-white">
                {w.initials}
              </span>
              <span>
                <span className="block text-lg font-semibold text-ink">{w.displayName}</span>
                <span className="block text-sm text-ink-3">{w.role === 'manager' ? t('Mistr') : t('Montér')}</span>
              </span>
            </button>
          </motion.li>
        ))}
      </ul>
    </main>
  );
}
