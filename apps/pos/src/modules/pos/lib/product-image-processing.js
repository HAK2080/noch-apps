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
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }
  }

  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = objectUrl
  await image.decode()
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  }
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

export function formatImageBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
