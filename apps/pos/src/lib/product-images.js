const PUBLIC_STORAGE_PATH = '/storage/v1/object/public/'

// Sizes stored at upload time by optimizeProductImageSet. Serving these keeps
// Supabase Storage image transformations at zero: that quota is billed per
// origin image and is small on the Pro plan, while egress is not.
export const STORED_IMAGE_VARIANTS = { full: '', card: '-720', thumb: '-160' }

/**
 * Address a stored size of a product image. Returns the master URL unchanged
 * when the source is not a public Storage object, so external and legacy URLs
 * keep working.
 *
 * Images uploaded before variants existed have no derivative file. Callers
 * should fall back to the master URL on load error; getProductImageFallback
 * returns the URL to fall back to.
 */
export function buildStoredProductImageUrl(source, variant = 'full') {
  if (!source) return ''
  const suffix = STORED_IMAGE_VARIANTS[variant] ?? ''
  if (!suffix) return source

  try {
    const url = new URL(source)
    if (!url.pathname.includes(PUBLIC_STORAGE_PATH)) return source

    // Insert the suffix before the extension: /1712.webp -> /1712-720.webp
    const match = url.pathname.match(/^(.*)(\.[^./]+)$/)
    if (!match) return source
    url.pathname = `${match[1]}${suffix}${match[2]}`
    return url.toString()
  } catch {
    return source
  }
}

/** The URL to use when a stored variant is missing (pre-variant uploads). */
export function getProductImageFallback(source) {
  return source || ''
}

/**
 * True when a product image has no stored card variant yet, i.e. it predates
 * variants and still needs re-rendering. Probes with HEAD so an already
 * converted catalogue costs one cheap request per product.
 *
 * A network failure reports false: re-rendering on a flaky connection would
 * upload the same image repeatedly.
 */
export async function productImageNeedsVariants(imageUrl, { fetchImpl = fetch } = {}) {
  if (!imageUrl) return false

  const cardUrl = buildStoredProductImageUrl(imageUrl, 'card')
  // An unchanged URL means this is not a public Storage object.
  if (!cardUrl || cardUrl === imageUrl) return false

  try {
    const response = await fetchImpl(cardUrl, { method: 'HEAD', cache: 'no-store' })
    return !response.ok
  } catch {
    return false
  }
}
