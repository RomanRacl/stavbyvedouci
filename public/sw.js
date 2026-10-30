/*
 * Service worker – zatím jen základ pro instalaci a rychlé načítání statických souborů.
 * Plný offline režim (zápisy bez signálu) přijde s Firebase, které má vlastní offline cache.
 * Stránky se vždy berou ze sítě, aby po nasazení nové verze nikdo neviděl starou.
 */
const CACHE = 'stavbyvedouci-static-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Next.js statické soubory mají v názvu hash → bezpečně cachovat natrvalo.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }),
    );
  }
});
