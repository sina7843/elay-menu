// Offline shell for the customer menu. The menu data itself is cached by the app (localStorage);
// this only keeps the page, its hashed assets and food/logo images loadable without a network.
const CACHE = 'elay-shell-v1';

// Precache the page plus every asset it references (scripts, styles) and the fonts those styles use.
async function precache() {
  const cache = await caches.open(CACHE);
  const html = await (await fetch('/', { cache: 'no-store' })).text();
  await cache.put('/', new Response(html, { headers: { 'content-type': 'text/html' } }));
  const ASSET = /\/assets\/[^"'\s)]+/g;
  const assets = [...new Set(html.match(ASSET) ?? [])];
  for (const css of assets.filter((a) => a.endsWith('.css'))) {
    const text = await (await fetch(css)).text();
    assets.push(...(text.match(ASSET) ?? []));
  }
  await cache.addAll([...new Set(assets)]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(fallbackUrl ?? request, res.clone());
    return res;
  } catch {
    return (await cache.match(fallbackUrl ?? request)) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/admin')) return; // panels need the network
  if (request.mode === 'navigate') event.respondWith(networkFirst(request, '/'));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request)); // content-hashed
  else if (url.pathname.startsWith('/api/media/')) event.respondWith(networkFirst(request)); // food photos, logos
  // Every other /api request goes to the network untouched (fresh data or a visible failure).
});
