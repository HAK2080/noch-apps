import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const menuUrl = new URL('../src/pages/storefront/Menu.jsx', import.meta.url)

test('customer-menu description visibility applies to cards and the detail popup', async () => {
  const menu = await readFile(menuUrl, 'utf8')

  assert.match(menu, /const fullDesc = p\.show_description_on_menu === false[\s\S]*\? ''/)
  assert.match(menu, /function desc_\(p\)[\s\S]*if \(p\.show_description_on_menu === false\) return ''/)
  assert.match(menu, /\{fullDesc && <p className="detail-desc">\{fullDesc\}<\/p>\}/)
  const popupDescriptionLogic = menu.match(/const fullDesc =[\s\S]*?\n\n  \/\/ Close on Escape/)?.[0] || ''
  assert.doesNotMatch(popupDescriptionLogic, /p\.description/)
})
