/**
 * Hlídání chyb v ostrém provozu. Bez nastavení jen zapisuje do konzole.
 * S proměnnou NEXT_PUBLIC_SENTRY_DSN (projekt na sentry.io, zdarma do 5 000 chyb měsíčně)
 * posílá chyby do Sentry – bez knihovny, přímo na jejich API.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';
const RELEASE = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local';

interface Parsed {
  url: string;
}

function parseDsn(dsn: string): Parsed | null {
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
  if (!m) return null;
  return { url: `https://${m[2]}/api/${m[3]}/store/?sentry_key=${m[1]}&sentry_version=7` };
}

const target = DSN ? parseDsn(DSN) : null;
const sent = new Map<string, number>();

function frames(stack: string | undefined) {
  return (stack ?? '')
    .split('\n')
    .slice(1, 30)
    .map((line) => {
      const m = line.match(/at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/) ?? line.match(/^(.*)@(.+?):(\d+):(\d+)$/);
      return m ? { function: m[1] || '?', filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) } : null;
    })
    .filter(Boolean)
    .reverse();
}

/** Nahlásí chybu. Stejná chyba se pošle nejvýš jednou za minutu, ať se nezahltí kvóta. */
export function reportError(error: unknown, context: Record<string, string> = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error('[Stavbyvedoucí]', err, context);
  if (!target || typeof window === 'undefined') return;
  const key = `${err.name}:${err.message}`;
  const last = sent.get(key) ?? 0;
  if (Date.now() - last < 60_000) return;
  sent.set(key, Date.now());
  const event = {
    event_id: Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    release: RELEASE,
    environment: process.env.NODE_ENV,
    request: { url: location.href.replace(/\?.*$/, ''), headers: { 'User-Agent': navigator.userAgent } },
    tags: { route: location.pathname, ...context },
    exception: { values: [{ type: err.name, value: err.message, stacktrace: { frames: frames(err.stack) } }] },
  };
  // Bez osobních údajů: žádná jména, e-maily ani obsah zakázek, jen technika chyby.
  void fetch(target.url, { method: 'POST', body: JSON.stringify(event), keepalive: true }).catch(() => undefined);
}

let installed = false;
/** Zachytí i chyby mimo React (události, promise). Volá se jednou v Providers. */
export function installErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, { source: 'window' }));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { source: 'promise' }));
}
