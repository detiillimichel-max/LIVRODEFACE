const CACHE_NAME = 'livrodeface-shell-v8';
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
  const isPage = request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  const cacheName = isCatalog ? CATALOG_CACHE : CACHE_NAME;

  // Páginas: prioriza a versão publicada no GitHub Pages e guarda uma cópia para uso offline.
  // Catálogos e demais arquivos: mantém o comportamento de cache com atualização em segundo plano.
  if (isPage) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) {
          await cache.put('./index.html', response.clone());
          return response;
        }
      } catch (error) {
        console.warn('Sem rede; usando a página em cache.', error);
      }
      return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
    })());
    return;
  }

  const refresh = caches.open(cacheName).then((cache) =>
    fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
  );

  event.waitUntil(refresh.then(() => undefined).catch(() => {}));
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return refresh;
  })());
});