const CACHE_NAME = 'redcon-offline-v1';
const APP_SHELL_URL = self.registration.scope;
const FACE_API_SCRIPT =
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/dist/face-api.js';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Cache the GitHub Pages app shell so the app can reopen without a network.
    await cache.add(APP_SHELL_URL);

    // The script tag is parsed before the service worker controls the first page.
    // Pre-cache this version so it is available on later offline launches.
    try {
      const response = await fetch(FACE_API_SCRIPT, { mode: 'cors' });
      if (response.ok) {
        await cache.put(FACE_API_SCRIPT, response.clone());
      }
    } catch (error) {
      // The app shell can still be installed; CDN assets are cached on use.
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('redcon-offline-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin && request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          await cache.put(APP_SHELL_URL, response.clone());
        }
        return response;
      } catch (error) {
        return (await cache.match(request))
          || (await cache.match(APP_SHELL_URL))
          || new Response('التطبيق غير محفوظ للعمل دون اتصال بعد.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  // Cache face-api.js and its model files. Supabase requests are deliberately
  // excluded so authentication and database writes are never served from cache.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })());
  }
});
