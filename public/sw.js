/*
 * Service worker – rychlé načítání a start aplikace i bez signálu.
 * - Statické soubory Next.js (s hashem v názvu) a ikony: z cache, stáhnou se jen poprvé.
 * - Stránky: vždy nejdřív ze sítě (nikdo neuvidí starou verzi po nasazení), uloží se do cache;
 *   bez signálu se otevře naposledy uložená verze. Data dělníka se ukládají v telefonu,
 *   po zapojení Firebase se zápisy bez signálu odešlou samy, jakmile se signál vrátí.
 */
const STATIC = 'stavbyvedouci-static-v2';
const PAGES = 'stavbyvedouci-pages-v2';
const KEEP = [STATIC, PAGES];

self.addEventListener('install', (e) => {
  // Mobil party si stránku uloží hned při instalaci, aby šel otevřít i bez signálu.
  e.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.add(new Request('/w', { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (await cache.match(url.pathname)) || (await cache.match('/w')) || Response.error();
        }),
    );
  }
});
