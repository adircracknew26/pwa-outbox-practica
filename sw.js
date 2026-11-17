const CACHE_STATIC_NAME = 'static-outbox-v1';
const STATIC_FILES = [
  './',
  './index.html',
  './styles.css',
  './db-helper.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Ciclo de vida: Instalación del sw y precaché del App Shell
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando sw v1...');
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME)
      .then((cache) => {
        console.log('[SW] Precargando App Shell en caché estática v1...');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Ciclo de vida: Activación del sw y limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando sw v1...');
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_STATIC_NAME) {
              console.log('[SW] Eliminando caché previa:', key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Ciclo de vida: Intercepción de peticiones (Cache First para archivos estáticos GET)
self.addEventListener('fetch', (event) => {
  // Las peticiones POST no se almacenan en Cache API
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});
