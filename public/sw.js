/**
 * Service worker — PWA groundwork (phase-00 §12).
 *
 * Registered, versioned, and updatable, but caching nothing on purpose. The offline strategy
 * (app shell, the local note library, the outbox) is designed in phase-09; shipping a cache now
 * would only mean shipping a stale-content bug now.
 *
 * Bump CACHE_VERSION when the caching strategy changes so old caches are cleared on activate.
 */
const CACHE_VERSION = 'lumen-v0';

self.addEventListener('install', () => {
  // Take over as soon as possible; there is no old cache worth preserving yet.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// No fetch handler: every request goes straight to the network. Phase-09 adds the strategy.
