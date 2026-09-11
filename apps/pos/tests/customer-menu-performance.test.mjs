import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const menuUrl = new URL('../src/pages/storefront/Menu.jsx', import.meta.url)
const logoUrl = new URL('../src/assets/noch-logo-menu.webp', import.meta.url)

test('customer menu keeps first-screen image downloads small and targeted', async () => {
  const [menu, logoStats] = await Promise.all([
    readFile(menuUrl, 'utf8'),
    stat(logoUrl),
  ])

  assert.match(menu, /import nochLogo from '\.\.\/\.\.\/assets\/noch-logo-menu\.webp'/)
  assert.ok(logoStats.size < 25 * 1024, `Menu logo should stay below 25 KB, got ${logoStats.size}`)
  assert.match(menu, /priorityImages=\{sectionIndex === 0\}/)
  assert.match(menu, /priorityCount=\{priorityImages \? 2 : 0\}/)
  assert.doesNotMatch(menu, /priority=\{index < 2\}/)
  assert.match(menu, /loading=\{priority \? 'eager' : 'lazy'\}/)
  // Sizes are rendered once at upload and served straight from Storage.
  // Supabase image transformations are quota-limited and billed per origin
  // image, so the menu must never build a render/image URL.
  assert.match(menu, /buildStoredProductImageUrl\(src, detail \? 'full' : 'card'\)/)
  assert.match(menu, /buildStoredProductImageUrl\(posterSrc, detail \? 'full' : 'card'\)/)
  assert.match(menu, /buildStoredProductImageUrl\(imageUrl, 'thumb'\)/)
  assert.doesNotMatch(menu, /render\/image/)
  assert.doesNotMatch(menu, /buildOptimizedProductImageUrl/)
  assert.match(menu, /function readCachedMenu/)
  assert.match(menu, /function writeCachedMenu/)
  assert.match(menu, /writeCachedMenu\(branchParam, b, cats \|\| \[\], prods \|\| \[\]\)/)
  assert.match(menu, /select\('id, name, lat, lng, geofence_radius_m'\)/)
  assert.doesNotMatch(menu, /from\('pos_products'\)[\s\S]{0,100}\.select\('\*'\)/)
})
