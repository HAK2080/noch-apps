export const PRODUCT_IMAGE_WIDTH = 1200
export const PRODUCT_IMAGE_HEIGHT = 1500
export const PRODUCT_IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024
export const PRODUCT_IMAGE_TARGET_BYTES = 300 * 1024

const PRODUCT_IMAGE_BACKGROUND = '#f8f3e8'
const PRODUCT_IMAGE_PADDING = 72
const WEBP_QUALITIES = [0.82, 0.76, 0.7]

export function calculateContainedImageRect(
  sourceWidth,
  sourceHeight,
  targetWidth = PRODUCT_IMAGE_WIDTH,
  targetHeight = PRODUCT_IMAGE_HEIGHT,
  padding = PRODUCT_IMAGE_PADDING,
) {
  const values = [sourceWidth, sourceHeight, targetWidth, targetHeight]
  if (values.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Image dimensions must be positive numbers')
  }

  const safePadding = Math.max(0, Math.min(padding, targetWidth / 2 - 1, targetHeight / 2 - 1))
  const availableWidth = targetWidth - safePadding * 2
  const availableHeight = targetHeight - safePadding * 2
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight)
  const width = Math.round(sourceWidth * scale)
  const height = Math.round(sourceHeight * scale)

  return {
    x: Math.round((targetWidth - width) / 2),
    y: Math.round((targetHeight - height) / 2),
    width,
    height,
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('This browser could not compress the image'))
    }, type, quality)
  })
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      }
    } catch {
      // Some mobile browsers expose createImageBitmap but reject particular
      // PNG/WebP encodings. Fall through to the regular image decoder.
    }
  }

  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  try {
    image.src = objectUrl
    if (typeof image.decode === 'function') await image.decode()
    else await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('This browser could not decode the image'))
    })
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  }
}

async function downloadProductImageThroughCanvas(imageUrl, filename) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Image download is unavailable in this browser')
  }

  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.decoding = 'async'
  image.src = imageUrl.toString()
  if (typeof image.decode === 'function') await image.decode()
  else await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error('Could not load the current image'))
  })

  const width = image.naturalWidth
  const height = image.naturalHeight
  if (!width || !height) throw new Error('The current product image has invalid dimensions')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image processing is unavailable in this browser')
  context.drawImage(image, 0, 0, width, height)

  const blob = await canvasToBlob(canvas, 'image/png')
  return new File([blob], filename.replace(/\.[^.]+$/, '') + '.png', {
    type: 'image/png',
    lastModified: Date.now(),
  })
}

export async function downloadProductImage(source, {
  fetchImpl = globalThis.fetch,
  baseUrl = globalThis.location?.origin || 'http://localhost',
} = {}) {
  if (!source) throw new Error('Add a product image first')
  if (typeof fetchImpl !== 'function') throw new Error('Image download is unavailable in this browser')

  let imageUrl
  try {
    imageUrl = new URL(source, baseUrl)
  } catch {
    throw new Error('The current product image URL is invalid')
  }

  let response
  try {
    response = await fetchImpl(imageUrl.toString(), {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
    })
  } catch {
    try {
      let fallbackFilename = imageUrl.pathname.split('/').pop() || 'product-image'
      try { fallbackFilename = decodeURIComponent(fallbackFilename) } catch { /* Keep URL-safe name. */ }
      return await downloadProductImageThroughCanvas(imageUrl, fallbackFilename)
    } catch {
      throw new Error('Could not download the current image. Upload it again, then optimize it.')
    }
  }
  if (!response.ok) throw new Error('Could not download the current image')

  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('The current product image is not a supported image file')

  let filename = imageUrl.pathname.split('/').pop() || 'product-image'
  try { filename = decodeURIComponent(filename) } catch { /* Keep the URL-safe filename. */ }
  return new File([blob], filename, { type: blob.type, lastModified: Date.now() })
}

function optimizedFilename(name = 'product-image') {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '')
  return `${base || 'product-image'}.webp`
}

export async function optimizeProductImage(file) {
  if (!(file instanceof Blob) || !file.type.startsWith('image/')) {
    throw new Error('Choose a valid image file')
  }
  if (file.size > PRODUCT_IMAGE_MAX_INPUT_BYTES) {
    throw new Error('Image must be smaller than 20 MB')
  }

  const decoded = await loadImage(file)
  try {
    if (!decoded.width || !decoded.height) throw new Error('Image has invalid dimensions')

    const canvas = document.createElement('canvas')
    canvas.width = PRODUCT_IMAGE_WIDTH
    canvas.height = PRODUCT_IMAGE_HEIGHT
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Image processing is unavailable in this browser')

    context.fillStyle = PRODUCT_IMAGE_BACKGROUND
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'

    const rect = calculateContainedImageRect(decoded.width, decoded.height)
    context.drawImage(decoded.image, rect.x, rect.y, rect.width, rect.height)

    let optimizedBlob = null
    for (const quality of WEBP_QUALITIES) {
      optimizedBlob = await canvasToBlob(canvas, 'image/webp', quality)
      if (optimizedBlob.size <= PRODUCT_IMAGE_TARGET_BYTES) break
    }

    const optimizedFile = new File([optimizedBlob], optimizedFilename(file.name), {
      type: 'image/webp',
      lastModified: Date.now(),
    })

    return {
      file: optimizedFile,
      originalBytes: file.size,
      optimizedBytes: optimizedFile.size,
      originalWidth: decoded.width,
      originalHeight: decoded.height,
      width: PRODUCT_IMAGE_WIDTH,
      height: PRODUCT_IMAGE_HEIGHT,
    }
  } finally {
    decoded.cleanup()
  }
}

export function generatedImageFileFromBase64(
  imageBase64,
  mimeType = 'image/webp',
  filename = 'ai-product-image.webp',
) {
  const normalized = String(imageBase64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '')
  if (!normalized || !/^[a-z0-9+/]+={0,2}$/i.test(normalized)) {
    throw new Error('AI returned an invalid product image')
  }

  const binary = atob(normalized)
  if (!binary.length || binary.length > PRODUCT_IMAGE_MAX_INPUT_BYTES) {
    throw new Error('AI returned a product image that is too large')
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], filename, { type: mimeType, lastModified: Date.now() })
}

export function formatImageBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
