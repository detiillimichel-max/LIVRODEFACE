const CACHE_NAME = 'livrodeface-shell-v2';
const CATALOG_CACHE = 'livrodeface-catalog-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .catch((error) => console.warn('Não foi possível guardar todos os arquivos do app:', error))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((key) => key.startsWith('livrodeface-') && key !== CACHE_NAME && key !== CATALOG_CACHE)
        .map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isCatalog = url.pathname.endsWith('/catalog.json') || url.pathname.endsWith('/candidatos.json');
  if (isCatalog) {
    event.respondWith((async () => {
      const cache = await caches.open(CATALOG_CACHE);
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      event.waitUntil(fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
      }).catch(() => {}));
      return cached;
    }
    const response = await fetch(request);
    if (response.ok && url.origin === self.location.origin) cache.put(request, response.clone());
    return response;
  })());
});