export const PRODUCT_VIDEO_MAX_BYTES = 20 * 1024 * 1024
export const PRODUCT_VIDEO_ACCEPT = 'video/mp4,video/webm'

const SUPPORTED_PRODUCT_VIDEO_TYPES = new Set(['video/mp4', 'video/webm'])

export function validateProductVideo(file) {
  if (!file) throw new Error('Choose a product video first')
  if (!SUPPORTED_PRODUCT_VIDEO_TYPES.has(file.type)) {
    throw new Error('Use an MP4 or WebM video')
  }
  if (file.size > PRODUCT_VIDEO_MAX_BYTES) {
    throw new Error('Product videos must be 20 MB or smaller')
  }
  return file
}

