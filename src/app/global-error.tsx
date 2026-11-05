'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/monitoring';

/** Poslední záchrana, když selže i samotný rám aplikace. Bez závislostí na stylech. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error, { boundary: 'global' }), [error]);
  return (
    <html lang="cs">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#eef0f2', color: '#16202a', margin: 0 }}>
        <main style={{ maxWidth: 480, margin: '15vh auto', padding: 24 }}>
          <h1 style={{ fontSize: 28 }}>Aplikace se nenačetla</h1>
          <p style={{ color: '#4a5561' }}>Vaše data v prohlížeči jsou v pořádku. Zkuste to znovu, případně stránku obnovte.</p>
          {error.digest && <p style={{ color: '#626c78', fontFamily: 'monospace' }}>Kód chyby: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ marginTop: 16, height: 44, padding: '0 16px', borderRadius: 8, border: 0, background: '#16202a', color: '#fff', fontWeight: 600 }}>
            Zkusit znovu
          </button>
        </main>
      </body>
    </html>
  );
}
