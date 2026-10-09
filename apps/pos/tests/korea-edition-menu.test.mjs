import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const menuUrl = new URL('../src/pages/storefront/Menu.jsx', import.meta.url)
const cssUrl = new URL('../src/pages/storefront/styles/AutumnBackground.css', import.meta.url)

test('seasonal collection uses autumn display labels and keeps live products', async () => {
  const menu = await readFile(menuUrl, 'utf8')
  assert.match(menu, /function isKoreaEditionCategory/)
  assert.match(menu, /korea\|korean\|한국\|كوريا\|كوري/)
  assert.match(menu, /<AutumnCollectionArtwork catLabel=\{catLabel\}/)
  assert.match(menu, /<h2>\{catLabel\}<\/h2>/)
  assert.match(menu, /مشروبات موسم الخريف/)
  assert.match(menu, /Autumn Seasonal Drinks/)
  assert.doesNotMatch(menu, /autumn-collection-nochi/)
  assert.match(menu, /<ScrollSection products=\{products\}/)
  assert.match(menu, /<GridSection products=\{products\}/)
  assert.match(menu, /onAdd=\{onAdd\}/)
  assert.doesNotMatch(menu, /korea-japan-menu-(stage|header)|products\.length === 4|koreaStage/)
})

test('autumn artwork stays separate from product content and original assets are preserved', async () => {
  const css = await readFile(cssUrl, 'utf8')
  assert.match(css, /\.autumn-collection-art/)
  assert.match(css, /pointer-events: none/)
  assert.match(css, /@media\(max-width:480px\)/)
  for (const asset of ['autumn/leaf.svg', 'autumn/pumpkin.svg', 'autumn/harvest-section.png', 'korea-japan-menu-header.webp', 'korea-japan-menu-stage.webp']) {
    assert.ok((await stat(new URL('../public/assets/' + asset, import.meta.url))).size > 0)
  }
})
