// Backfill stored image sizes for products uploaded before variants existed.
//
// Images uploaded earlier have only the master file, so the app falls back to
// it. Those products keep working, but every one of them is an origin image
// that would otherwise need a Storage transformation. Re-rendering them here
// is what takes the transformation quota to zero.
//
// This runs in the browser because the optimizer is canvas-based.

import { productImageNeedsVariants } from '../../../lib/product-images'
import { downloadStoredProductImage, uploadProductImage } from './pos-supabase'
import { downloadProductImage, optimizeProductImageSet } from './product-image-processing'

async function sourceFileFor(imageUrl) {
  try {
    return await downloadStoredProductImage(imageUrl)
  } catch {
    return await downloadProductImage(imageUrl)
  }
}

/**
 * Render and upload the stored sizes for every product that still lacks them.
 *
 * Sequential on purpose: each product decodes a full-size image and uploads
 * three files, and a café tablet should not run that in parallel. One failure
 * is recorded and the run continues.
 *
 * @returns {Promise<{total:number, converted:number, skipped:number, failed:Array}>}
 */
export async function backfillProductImageVariants(products, { onProgress, shouldStop } = {}) {
  const targets = (products || []).filter(product => product?.image_url)
  const failed = []
  let converted = 0
  let skipped = 0
  let done = 0

  const report = () => onProgress?.({
    done, total: targets.length, converted, skipped, failed: failed.length,
  })

  report()

  for (const product of targets) {
    if (shouldStop?.()) break

    try {
      if (!(await productImageNeedsVariants(product.image_url))) {
        skipped += 1
      } else {
        const source = await sourceFileFor(product.image_url)
        const optimized = await optimizeProductImageSet(source)
        await uploadProductImage(product.id, optimized)
        converted += 1
      }
    } catch (error) {
      failed.push({
        id: product.id,
        name: product.name || product.id,
        message: error?.message || 'Unknown error',
      })
    }

    done += 1
    report()
  }

  return { total: targets.length, converted, skipped, failed }
}
