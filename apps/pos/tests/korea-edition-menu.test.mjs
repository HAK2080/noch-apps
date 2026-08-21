import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const menuUrl = new URL('../src/pages/storefront/Menu.jsx', import.meta.url)
const menuCssUrl = new URL('../src/pages/storefront/styles/Menu.css', import.meta.url)
const nochiFaceUrl = new URL('../src/assets/nochi-face-korea.png', import.meta.url)

test('Korean-drinks category receives the Korea Edition campaign treatment', async () => {
  const menu = await readFile(menuUrl, 'utf8')

  assert.match(menu, /function isKoreaEditionCategory/)
  assert.match(menu, /korea\|korean\|한국\|كوريا\|كوري/)
  assert.match(menu, /koreaEdition \? ' korea-edition'/)
  assert.match(menu, /<KoreaEditionHero lang=\{lang\}/)
  assert.match(menu, /한국에서 온 맛/)
  assert.match(menu, /KOREA/)
  assert.match(menu, /AUTHENTIC KOREAN DRINKS/)
  assert.match(menu, /اختيارات نوشي/)
  assert.doesNotMatch(menu, />🇰🇷</)
})

test('Korea Edition stays responsive and does not add a heavy campaign background', async () => {
  const [css, faceStats] = await Promise.all([
    readFile(menuCssUrl, 'utf8'),
    stat(nochiFaceUrl),
  ])

  assert.match(css, /\.cat-section\.korea-edition/)
  assert.match(css, /max-width: 1180px/)
  assert.match(css, /\.korea-edition-scenery/)
  assert.match(css, /\.korea-edition-title[\s\S]*direction: ltr/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /\.korea-edition \.scroll-card \{ width: min\(70vw, 244px\)/)
  assert.ok(faceStats.size < 150 * 1024, `Nochi face should stay below 150 KB, got ${faceStats.size}`)
})
