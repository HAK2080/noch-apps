// Service worker for noch.apps POS.
// Two goals:
//   1. Make the app installable as a PWA.
//   2. Make a reload-while-offline actually open the app — not just the
//      shell HTML, but the hashed JS/CSS bundles too. Without this, a
//      cashier whose tablet sleeps and wakes offline gets a blank page.
//
// Strategy:
//   - Shell HTML plus every script/style/modulepreload referenced by it is
//     precached at install. A newly activated worker is therefore complete
//     before it removes the previous release cache.
//   - Every same-origin /assets/* file is cached on first fetch
//     (cache-first with network fallback). New deploys add new hashed
//     filenames; old ones stay in cache until their entry rolls over
//     (next cache-name bump).
//   - Navigation requests (HTML) are network-first so a fresh deploy is
//     visible immediately when online; offline they fall back to the
//     cached /index.html.
//   - Supabase product-image derivatives use a separate persistent cache.
//     REST/auth traffic always passes through untouched.
//
// Cache name is stamped per-build via the SW_CACHE_VERSION token below.
// deploy.py replaces it at deploy time so each release activates a fresh
// cache and old entries are purged on activate.

const CACHE = 'noch-pos-2026-05-07-1'   // bump on each deploy
const IMAGE_CACHE = 'noch-pos-images-v1'
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']
const IMAGE_CACHE_LIMIT = 180

async function precacheCurrentShell() {
  const cache = await caches.open(CACHE)
  const indexResponse = await fetch('/index.html', { cache: 'reload' })
  if (!indexResponse?.ok) throw new Error('Could not precache the POS entry point')
  const html = await indexResponse.clone().text()
  const assetUrls = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)]
    .map(match => match[1])
  await Promise.all([
    cache.put('/index.html', indexResponse.clone()),
    cache.put('/', indexResponse.clone()),
  ])

  const urls = [...new Set([...SHELL.slice(2), ...assetUrls])]
  await Promise.all(urls.map(async url => {
    const response = await fetch(url, { cache: 'reload' })
    if (!response?.ok) throw new Error(`Could not precache ${url}`)
    await cache.put(url, response)
  }))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheCurrentShell()
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter(k => k.startsWith('noch-pos-') && k !== CACHE && k !== IMAGE_CACHE)
        .map(k => caches.delete(k)))
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

function isSupabaseProductImage(url) {
  return url.hostname.endsWith('.supabase.co')
    && (url.pathname.includes('/storage/v1/object/public/product-images/')
      || url.pathname.includes('/storage/v1/render/image/public/product-images/'))
}

async function trimImageCache(cache) {
  const keys = await cache.keys()
  if (keys.length <= IMAGE_CACHE_LIMIT) return
  await Promise.all(keys.slice(0, keys.length - IMAGE_CACHE_LIMIT).map(key => cache.delete(key)))
}

async function fetchWithTimeout(request, timeoutMs = 4000, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(request, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try { url = new URL(req.url) } catch { return }

  // Product photos are immutable/versioned uploads. Keep the optimized
  // derivative available across deployments and offline café sessions.
  if (isSupabaseProductImage(url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async cache => {
        const cached = await cache.match(req)
        if (cached) return cached
        const response = await fetch(req)
        if (response?.ok || response?.type === 'opaque') {
          cache.put(req, response.clone()).then(() => trimImageCache(cache)).catch(() => {})
        }
        return response
      })
    )
    return
  }

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
  // Use cache: 'reload' so the HTML always comes from the network and
  // bypasses the browser's HTTP disk cache — otherwise a fresh deploy can
  // be masked by a stale cached index.html that still points at old bundles.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(req, 4000, { cache: 'reload' }).then((res) => {
        if (res && res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', clone)).catch(() => {})
        }
        return res
      }).catch(async () => (await caches.match('/index.html')) || caches.match('/'))
    )
    return
  }

  // Cross-origin (Supabase) and everything else: pass through, no cache.
})
