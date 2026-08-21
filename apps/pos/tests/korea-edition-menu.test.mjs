import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const menuUrl = new URL('../src/pages/storefront/Menu.jsx', import.meta.url)
const menuCssUrl = new URL('../src/pages/storefront/styles/Menu.css', import.meta.url)
const bannerUrl = new URL('../public/assets/korea-japan-banner.png', import.meta.url)

test('Korean and Japanese drinks use the supplied banner without replacing live products', async () => {
  const menu = await readFile(menuUrl, 'utf8')

  assert.match(menu, /function isKoreaEditionCategory/)
  assert.match(menu, /korea\|korean\|한국\|كوريا\|كوري/)
  assert.match(menu, /koreaEdition \? ' korea-edition'/)
  assert.match(menu, /function KoreaJapanBanner/)
  assert.match(menu, /\/assets\/korea-japan-banner\.png/)
  assert.match(menu, /<KoreaJapanBanner catLabel=\{catLabel\}/)
  assert.match(menu, /<ScrollSection products=\{products\}/)
  assert.match(menu, /onAdd=\{onAdd\}/)
  assert.doesNotMatch(menu, /nochiFaceKorea|korea-edition-mascot|KoreaEditionHero/)
})

test('reference-matched section renders four live cards across and adapts on mobile', async () => {
  const [css, bannerStats] = await Promise.all([
    readFile(menuCssUrl, 'utf8'),
    stat(bannerUrl),
  ])

  assert.match(css, /\.cat-section\.korea-edition/)
  assert.match(css, /\.cat-section\.korea-edition[\s\S]*max-width: 700px/)
  assert.match(css, /\.korea-japan-banner img/)
  assert.match(css, /flex: 0 0 calc\(\(100% - 36px\) \/ 4\)/)
  assert.match(css, /grid-template-columns: repeat\(4, 1fr\)/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /flex-basis: min\(70vw, 244px\)/)
  assert.ok(bannerStats.size < 1.5 * 1024 * 1024, `Banner should stay below 1.5 MB, got ${bannerStats.size}`)
})
