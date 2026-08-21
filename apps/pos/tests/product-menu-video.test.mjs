import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  PRODUCT_VIDEO_ACCEPT,
  PRODUCT_VIDEO_MAX_BYTES,
  validateProductVideo,
} from '../src/modules/pos/lib/product-video.js'

const posProductsUrl = new URL('../src/modules/pos/pages/POSProducts.jsx', import.meta.url)
const catalogUrl = new URL('../src/pages/ProductCatalog.jsx', import.meta.url)
const posMenuUrl = new URL('../src/pages/storefront/Menu.jsx', import.meta.url)
const posMenuCssUrl = new URL('../src/pages/storefront/styles/Menu.css', import.meta.url)
const posSupabaseUrl = new URL('../src/modules/pos/lib/pos-supabase.js', import.meta.url)
const websiteMenuUrl = new URL('../../storefront/src/pages/Menu.jsx', import.meta.url)
const websiteCssUrl = new URL('../../storefront/src/styles.css', import.meta.url)
const deployedWebsiteUrl = new URL('../../storefront/index.html', import.meta.url)
const migrationUrl = new URL('../../../supabase/migrations/20260821094500_product_menu_video.sql', import.meta.url)

test('product video validation keeps customer media small and browser-compatible', () => {
  assert.equal(PRODUCT_VIDEO_ACCEPT, 'video/mp4,video/webm')
  assert.equal(PRODUCT_VIDEO_MAX_BYTES, 20 * 1024 * 1024)
  assert.doesNotThrow(() => validateProductVideo({ type: 'video/mp4', size: 1024 }))
  assert.throws(() => validateProductVideo({ type: 'video/quicktime', size: 1024 }), /MP4 or WebM/)
  assert.throws(() => validateProductVideo({ type: 'video/mp4', size: PRODUCT_VIDEO_MAX_BYTES + 1 }), /20 MB/)
})

test('product editors upload and persist optional menu videos', async () => {
  const [posProducts, catalog, dataSource] = await Promise.all([
    readFile(posProductsUrl, 'utf8'),
    readFile(catalogUrl, 'utf8'),
    readFile(posSupabaseUrl, 'utf8'),
  ])

  for (const source of [posProducts, catalog]) {
    assert.match(source, /Customer-menu video/)
    assert.match(source, /PRODUCT_VIDEO_ACCEPT/)
    assert.match(source, /uploadProductVideo/)
    assert.match(source, /video_url/)
  }
  assert.match(dataSource, /export async function uploadProductVideo/)
  assert.match(dataSource, /update\(\{ video_url: publicUrl/)
  assert.match(dataSource, /cacheControl: '31536000'/)
})

test('both customer menus prefer lazy muted video with photo fallback', async () => {
  const [posMenu, posCss, websiteMenu, websiteCss, deployedWebsite] = await Promise.all([
    readFile(posMenuUrl, 'utf8'),
    readFile(posMenuCssUrl, 'utf8'),
    readFile(websiteMenuUrl, 'utf8'),
    readFile(websiteCssUrl, 'utf8'),
    readFile(deployedWebsiteUrl, 'utf8'),
  ])

  for (const source of [posMenu, websiteMenu]) {
    assert.match(source, /video_url|videoSrc/)
    assert.match(source, /IntersectionObserver/)
    assert.match(source, /navigator\.connection\?\.saveData/)
    assert.match(source, /preload="none"/)
    assert.match(source, /muted/)
    assert.match(source, /playsInline/)
  }
  assert.match(posCss, /\.menu-product-video-media/)
  assert.match(websiteCss, /\.card-menu-image,\.card-menu-video/)
  assert.match(deployedWebsite, /function ProductMenuMedia/)
  assert.match(deployedWebsite, /image_url,video_url/)
  assert.match(deployedWebsite, /IntersectionObserver/)
  assert.match(deployedWebsite, /preload="none"/)
})

test('database migration adds the optional product video field', async () => {
  const migration = await readFile(migrationUrl, 'utf8')
  assert.match(migration, /alter table public\.pos_products/)
  assert.match(migration, /add column if not exists video_url text/)
})
