'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { reportError } from '@/lib/monitoring';

/** Chyba na jedné stránce: zbytek aplikace běží dál, data v prohlížeči zůstávají. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error, { boundary: 'route', ...(error.digest ? { digest: error.digest } : {}) }), [error]);
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center px-6 py-16">
      <p className="font-display text-sm font-semibold tracking-wide text-crit-ink uppercase">Něco se pokazilo</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-ink">Tahle stránka se nenačetla</h1>
      <p className="mt-3 text-base text-ink-2">Vaše data jsou v pořádku. Zkuste stránku načíst znovu. Když se chyba opakuje, pošlete nám prosím kód níže.</p>
      {error.digest && <p className="mt-3 font-mono text-sm text-ink-3">Kód chyby: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white">
          <RotateCcw className="size-4" /> Zkusit znovu
        </button>
        <Link href="/dashboard" className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink">
          Na přehled zakázek
        </Link>
      </div>
    </main>
  );
}
