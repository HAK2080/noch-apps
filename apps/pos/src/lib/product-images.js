const PUBLIC_STORAGE_PATH = '/storage/v1/object/public/'
const TRANSFORMED_STORAGE_PATH = '/storage/v1/render/image/public/'

export function buildOptimizedProductImageUrl(source, {
  width = 400,
  height = 500,
  quality = 80,
  resize = 'contain',
} = {}) {
  if (!source) return ''

  try {
    const url = new URL(source)
    if (!url.pathname.includes(PUBLIC_STORAGE_PATH)) return source

    url.pathname = url.pathname.replace(PUBLIC_STORAGE_PATH, TRANSFORMED_STORAGE_PATH)
    url.searchParams.set('width', String(width))
    url.searchParams.set('height', String(height))
    url.searchParams.set('resize', resize)
    url.searchParams.set('quality', String(quality))
    return url.toString()
  } catch {
    return source
  }
}

export function isOptimizedProductImageUrl(source) {
  if (!source) return false

  try {
    return new URL(source).pathname.includes(TRANSFORMED_STORAGE_PATH)
  } catch {
    return false
  }
}
