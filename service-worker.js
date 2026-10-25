const CACHE_NAME = 'livrodeface-shell-v4';
const CATALOG_CACHE = 'livrodeface-catalog-v3';
const SHELL = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch((error) => {
    console.warn('Cache inicial parcial:', error);
  }));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('livrodeface-') && key !== CACHE_NAME && key !== CATALOG_CACHE)
      .map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isCatalog = url.pathname.endsWith('/catalog.json') || url.pathname.endsWith('/candidatos.json') || url.pathname.endsWith('/colecoes.json');
  const cacheName = isCatalog ? CATALOG_CACHE : CACHE_NAME;
  const refresh = caches.open(cacheName).then((cache) =>
    fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
  );

  // Registra a atualização em segundo plano durante o evento, sem atrasar a resposta em cache.
  event.waitUntil(refresh.then(() => undefined).catch(() => {}));
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return refresh;
  })());
});