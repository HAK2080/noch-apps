const PRODUCT_MEDIA_PREFIX = '/storage/v1/object/public/product-images/'
const SUPABASE_ORIGIN = 'https://kxqjasdvoohiexedtfqw.supabase.co'
const WORKER_ORIGIN = 'https://noch-menu-media.2080testing.workers.dev'
const PRODUCT_KEY = /^products\/[0-9a-f-]{36}\/[a-z0-9._-]+\.(?:webp|png|jpe?g|mp4|webm)$/i

export function menuMediaUrl(source) {
  if (!source) return source
  try {
    const url = new URL(source)
    if (url.origin !== SUPABASE_ORIGIN || !url.pathname.startsWith(PRODUCT_MEDIA_PREFIX)) return source
    const key = url.pathname.slice(PRODUCT_MEDIA_PREFIX.length)
    if (!PRODUCT_KEY.test(key)) return source
    return `${WORKER_ORIGIN}/${key}${url.search}`
  } catch {
    return source
  }
}
