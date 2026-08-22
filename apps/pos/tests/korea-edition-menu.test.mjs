import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const menuUrl = new URL('../src/pages/storefront/Menu.jsx', import.meta.url)
const menuCssUrl = new URL('../src/pages/storefront/styles/Menu.css', import.meta.url)
const stageUrl = new URL('../public/assets/korea-japan-menu-stage.webp', import.meta.url)
const mobileHeaderUrl = new URL('../public/assets/korea-japan-menu-header.webp', import.meta.url)
const fallbackUrl = new URL('../public/assets/korea-japan-menu-stage.jpg', import.meta.url)

test('Korean and Japanese drinks use the supplied banner without replacing live products', async () => {
  const menu = await readFile(menuUrl, 'utf8')

  assert.match(menu, /function isKoreaEditionCategory/)
  assert.match(menu, /korea\|korean\|한국\|كوريا\|كوري/)
  assert.match(menu, /koreaEdition \? ' korea-edition'/)
  assert.match(menu, /function KoreaJapanBanner/)
  assert.match(menu, /\/assets\/korea-japan-menu-stage\.webp/)
  assert.match(menu, /\/assets\/korea-japan-menu-header\.webp/)
  assert.match(menu, /\/assets\/korea-japan-menu-stage\.jpg/)
  assert.match(menu, /products\.length === 4/)
  assert.match(menu, /className="korea-japan-stage"/)
  assert.match(menu, /<KoreaJapanBanner catLabel=\{catLabel\}/)
  assert.match(menu, /<ScrollSection products=\{products\}/)
  assert.match(menu, /onAdd=\{onAdd\}/)
  assert.doesNotMatch(menu, /nochiFaceKorea|korea-edition-mascot|KoreaEditionHero/)
})

test('reference-matched section is prominent and places four live cards over the artwork placeholders', async () => {
  const [css, stageStats, mobileHeaderStats, fallbackStats] = await Promise.all([
    readFile(menuCssUrl, 'utf8'),
    stat(stageUrl),
    stat(mobileHeaderUrl),
    stat(fallbackUrl),
  ])

  assert.match(css, /\.cat-section\.korea-edition/)
  assert.match(css, /\.cat-section\.korea-edition[\s\S]*max-width: 960px/)
  assert.match(css, /\.korea-japan-banner img/)
  assert.match(css, /\.korea-japan-stage\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/s)
  assert.match(css, /\.korea-japan-stage \.scroll-row\s*\{[^}]*top:\s*48\.83%;[^}]*right:\s*8\.27%;[^}]*bottom:\s*4\.3%;[^}]*left:\s*7\.49%/s)
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(css, /gap:\s*3\.01%/)
  assert.match(css, /@media \(max-width: 899px\)/)
  assert.match(css, /aspect-ratio:\s*12\s*\/\s*5/)
  assert.match(css, /flex-basis: min\(78vw, 286px\)/)
  assert.match(css, /\.korea-japan-stage \.scroll-card \.scroll-card-name\s*\{[^}]*font-size:\s*15px/s)
  assert.match(css, /\.korea-japan-stage \.scroll-card \.scroll-card-price\s*\{\s*font-size:\s*16px/)
  assert.ok(stageStats.size < 150 * 1024, `Desktop artwork should stay below 150 KB, got ${stageStats.size}`)
  assert.ok(mobileHeaderStats.size < 60 * 1024, `Mobile artwork should stay below 60 KB, got ${mobileHeaderStats.size}`)
  assert.ok(fallbackStats.size < 220 * 1024, `Fallback artwork should stay below 220 KB, got ${fallbackStats.size}`)
})
