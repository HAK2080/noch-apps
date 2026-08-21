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
  assert.match(menu, /\{ width: 360, height: 450, quality: 74 \}/)
  assert.match(menu, /\{ width: 720, height: 900, quality: 80 \}/)
  assert.match(menu, /\{ width: 64, height: 64, quality: 70 \}/)
  assert.match(menu, /function readCachedMenu/)
  assert.match(menu, /function writeCachedMenu/)
  assert.match(menu, /writeCachedMenu\(branchParam, b, cats \|\| \[\], prods \|\| \[\]\)/)
  assert.match(menu, /select\('id, name, lat, lng, geofence_radius_m'\)/)
  assert.doesNotMatch(menu, /from\('pos_products'\)[\s\S]{0,100}\.select\('\*'\)/)
})
