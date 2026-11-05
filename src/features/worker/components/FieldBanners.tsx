'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Download, Share, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import { useInstall, useOnline } from '@/lib/pwa';

/** Lišta „bez signálu“. Po návratu signálu krátce potvrdí, že je vše v pořádku. */
export function OfflineBanner() {
  const online = useOnline();
  const [back, setBack] = useState(false);
  const was = useRef(online);
  useEffect(() => {
    if (online && !was.current) {
      setBack(true);
      const id = setTimeout(() => setBack(false), 3500);
      was.current = online;
      return () => clearTimeout(id);
    }
    was.current = online;
  }, [online]);

  return (
    <AnimatePresence initial={false}>
      {(!online || back) && (
        <motion.div
          key={online ? 'on' : 'off'}
          role="status"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={`mt-4 flex items-start gap-3 rounded-2xl px-4 py-3 text-[15px] ${online ? 'bg-good/12 text-good-ink' : 'bg-ink text-white'}`}
        >
          {!online && <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />}
          <p>
            {online
              ? t('Signál je zpět.')
              : t('Jste bez signálu. Nevadí: čas, materiál i fotky se ukládají v telefonu.')}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Nabídka „Přidat na plochu“ – aplikace se pak otvírá jako normální aplikace bez prohlížeče. */
export function InstallCard({ onInstalled }: { onInstalled: () => void }) {
  const { mode, install, hide } = useInstall();
  if (!mode) return null;
  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-4" aria-labelledby="inst-h">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- malá statická ikona */}
        <img src="/icons/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 id="inst-h" className="text-base font-semibold text-ink">
            {t('Přidat na plochu')}
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            {mode === 'ios'
              ? t('Klepněte dole na Sdílet a pak na „Přidat na plochu“. Aplikace se otevře jedním klepnutím.')
              : t('Aplikace se pak otevře jedním klepnutím, bez prohlížeče, a funguje i se slabým signálem.')}
          </p>
        </div>
        <button type="button" onClick={hide} aria-label={t('Už nenabízet')} className="-mt-1 -mr-1 grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 active:bg-concrete">
          <X className="size-5" />
        </button>
      </div>
      {mode === 'prompt' ? (
        <button
          type="button"
          onClick={async () => {
            if (await install()) onInstalled();
          }}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-base font-semibold text-white active:scale-[0.98]"
        >
          <Download className="size-4" /> {t('Nainstalovat')}
        </button>
      ) : (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-concrete px-3 py-2 text-sm text-ink-2">
          <Share className="size-4 shrink-0" aria-hidden /> {t('Sdílet → Přidat na plochu')}
        </p>
      )}
    </section>
  );
}
