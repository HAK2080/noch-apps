// Service worker for noch.apps POS.
// Two goals:
//   1. Make the app installable as a PWA.
//   2. Make a reload-while-offline actually open the app — not just the
//      shell HTML, but the hashed JS/CSS bundles too. Without this, a
//      cashier whose tablet sleeps and wakes offline gets a blank page.
//
// Strategy:
//   - Shell (/, /index.html, /favicon.svg, /manifest.webmanifest, fonts)
//     is precached at install.
//   - Every same-origin /assets/* file is cached on first fetch
//     (cache-first with network fallback). New deploys add new hashed
//     filenames; old ones stay in cache until their entry rolls over
//     (next cache-name bump).
//   - Navigation requests (HTML) are network-first so a fresh deploy is
//     visible immediately when online; offline they fall back to the
//     cached /index.html.
//   - Everything cross-origin (Supabase REST, Storage) passes through —
//     never cached, never intercepted.
//
// Cache name is stamped per-build via the SW_CACHE_VERSION token below.
// deploy.py replaces it at deploy time so each release activates a fresh
// cache and old entries are purged on activate.

const CACHE = 'noch-pos-2026-05-07-1'   // bump on each deploy
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false
  const p = url.pathname
  return (
    p.startsWith('/assets/') ||
    p.startsWith('/fonts/') ||
    p === '/favicon.svg' ||
    p === '/manifest.webmanifest' ||
    p === '/icons.svg'
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try { url = new URL(req.url) } catch { return }

  // Same-origin static asset: cache-first.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {})
          }
          return res
        })
      })
    )
    return
  }

  // Page navigation: network-first, cached shell as fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', clone)).catch(() => {})
        }
        return res
      }).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Cross-origin (Supabase) and everything else: pass through, no cache.
})
