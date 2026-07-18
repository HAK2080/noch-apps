// Noch Snap — minimal service worker.
// Exists only so the PWA is installable (Add to Home Screen).
// Deliberately caches NOTHING: the admin app must always be fresh.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
// No fetch handler on purpose — all requests pass straight to the network.
