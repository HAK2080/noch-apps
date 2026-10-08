// Cache only public product photos. Never cache account/API responses or
// video ranges, and never download the catalogue in the background.
const IMAGE_CACHE = 'noch-storefront-product-photos-v1'
const IMAGE_CACHE_LIMIT = 180
const pendingPhotos = new Map()

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

async function loadPhoto(request) {
  const cache = await caches.open(IMAGE_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  // Several cards can show the same product. Share their first download.
  if (!pendingPhotos.has(request.url)) {
    const pending = (async () => {
      const response = await fetch(request)
      if (response.ok || response.type === 'opaque') {
        try {
          await cache.put(request, response.clone())
          const keys = await cache.keys()
          for (const key of keys.slice(0, Math.max(0, keys.length - IMAGE_CACHE_LIMIT))) {
            await cache.delete(key)
          }
        } catch {
          // Storage may be disabled or full; the photo should still display.
        }
      }
      return response
    })()
    pendingPhotos.set(request.url, pending)
    pending.finally(() => pendingPhotos.delete(request.url)).catch(() => {})
  }
  return (await pendingPhotos.get(request.url)).clone()
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || request.headers.has('range')) return
  const url = new URL(request.url)
  if (url.hostname !== 'kxqjasdvoohiexedtfqw.supabase.co'
    || !url.pathname.startsWith('/storage/v1/object/public/product-images/')
    || !/\.(webp|png|jpe?g|avif|gif)$/i.test(url.pathname)) return
  event.respondWith(loadPhoto(request))
})
