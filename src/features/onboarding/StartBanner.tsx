'use client';

import { Download, PartyPopper, Rocket, Smartphone, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { downloadBackup } from '@/lib/backup';

const HIDE = 'stavbyvedouci:demo-banner-hidden';

/**
 * Nahoře na přehledu zakázek: u ukázkové firmy nabídka „Začít naostro“,
 * po dokončení průvodce uvítání s dalšími kroky.
 */
export function StartBanner({ fresh, welcome, onNewJob }: { fresh: boolean; welcome: boolean; onNewJob: () => void }) {
  const [hidden, setHidden] = useState(true);
  const [welcomeOpen, setWelcomeOpen] = useState(welcome);
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(HIDE) === '1');
    } catch {
      setHidden(false);
    }
  }, []);
  useEffect(() => setWelcomeOpen(welcome), [welcome]);

  if (fresh && welcomeOpen) {
    return (
      <section className="rounded-xl border border-good/40 bg-surface p-5" aria-labelledby="welcome-h">
        <div className="flex items-start gap-3">
          <PartyPopper className="mt-0.5 size-6 shrink-0 text-good" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="welcome-h" className="text-base font-semibold text-ink">
              Hotovo, firma jede naostro
            </h2>
            <p className="mt-1 text-sm text-ink-2">Tři věci, kterými je dobré začít:</p>
            <ol className="mt-3 grid gap-2 sm:grid-cols-3">
              <li>
                <button type="button" onClick={onNewJob} className="flex h-full w-full items-start gap-2 rounded-lg border border-line p-3 text-left text-sm hover:bg-concrete">
                  <Rocket className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <b className="block text-ink">Založte první zakázku</b>
                    <span className="text-ink-2">nebo ji převezměte z nabídky</span>
                  </span>
                </button>
              </li>
              <li>
                <a href="/w" target="_blank" rel="noreferrer" className="flex h-full items-start gap-2 rounded-lg border border-line p-3 text-sm hover:bg-concrete">
                  <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <b className="block text-ink">Pošlete partě odkaz</b>
                    <span className="text-ink-2">{typeof window !== 'undefined' ? `${window.location.host}/w` : '/w'}, ať si ho přidají na plochu</span>
                  </span>
                </a>
              </li>
              <li>
                <button type="button" onClick={() => void downloadBackup(true)} className="flex h-full w-full items-start gap-2 rounded-lg border border-line p-3 text-left text-sm hover:bg-concrete">
                  <Download className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <b className="block text-ink">Zálohujte jednou týdně</b>
                    <span className="text-ink-2">dokud data žijí jen v prohlížeči</span>
                  </span>
                </button>
              </li>
            </ol>
          </div>
          <button type="button" onClick={() => setWelcomeOpen(false)} aria-label="Zavřít uvítání" className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-concrete">
            <X className="size-4" />
          </button>
        </div>
      </section>
    );
  }
  if (fresh || hidden) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-series-1/30 bg-series-1/8 px-4 py-3 text-sm">
      <Rocket className="size-5 shrink-0 text-series-1-ink" aria-hidden />
      <p className="min-w-0 flex-1 text-ink">
        <b>Díváte se na ukázkovou firmu.</b> <span className="text-ink-2">Až budete chtít aplikaci používat doopravdy, průvodce ji připraví pro vaši firmu.</span>
      </p>
      <Link href="/zacit" className="inline-flex h-9 items-center rounded-lg bg-ink px-3 font-semibold text-white hover:bg-ink/90">
        Začít naostro
      </Link>
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem(HIDE, '1');
          } catch {
            /* nic */
          }
        }}
        aria-label="Skrýt"
        className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-concrete"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
