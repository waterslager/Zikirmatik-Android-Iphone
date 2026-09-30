// Zikirmatik service worker
// Strateji: önce cache (anında açılış), arka planda ağdan güncelle (stale-while-revalidate).
// Yeni sürüm yayınladığında CACHE_NAME'i değiştirmen gerekmez; içerik arka planda kendini yeniler.

const CACHE_PREFIX = 'zikirmatik-';
const CACHE_NAME = CACHE_PREFIX + 'v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './192.png',
  './512.png',
  './maskable-192.png',
  './maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Tek bir dosya eksik/bozuk olsa bile kurulum başarısız olmasın
    await Promise.all(ASSETS.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok && !res.redirected) await cache.put(url, res);
      } catch (e) { /* çevrimdışı ya da dosya yok: atla */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Sadece kendi eski cache'lerini sil (github.io üzerindeki diğer projelere dokunma)
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

async function refresh(cache, key) {
  // no-cache: tarayıcı HTTP önbelleğine değil, sunucuya (koşullu istek) sorar
  const res = await fetch(key, { cache: 'no-cache' });
  if (res.ok && res.type === 'basic' && !res.redirected) {
    await cache.put(key, res.clone());
  }
  return res;
}

async function handle(event) {
  const req = event.request;
  const url = new URL(req.url);
  url.search = '';
  url.hash = '';
  const key = url.href;

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key);

  if (cached) {
    event.waitUntil(refresh(cache, key).catch(() => {}));
    return cached;
  }

  try {
    return await refresh(cache, key);
  } catch (e) {
    if (req.mode === 'navigate') {
      const fallback = await cache.match(new URL('./index.html', self.registration.scope).href);
      if (fallback) return fallback;
    }
    return new Response('Çevrimdışı', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(handle(event));
});
