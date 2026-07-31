import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const read = relative => fs.readFileSync(path.join(testDir, '..', relative), 'utf8')
const css = read('src/index.css')
const layout = read('src/components/Layout.jsx')
const dashboard = read('src/pages/Dashboard.jsx')
const statsBar = read('src/components/dashboard/StatsBar.jsx')
const terminal = read('src/modules/pos/pages/POSTerminal.jsx')
const cart = read('src/modules/pos/components/CartPanel.jsx')
const login = read('src/pages/Login.jsx')
const languageToggle = read('src/components/shared/LanguageToggle.jsx')
const themeToggle = read('src/components/shared/ThemeToggle.jsx')

test('staff skin keeps one scoped cream/ink visual seam', () => {
  for (const token of ['#F4EFE1', '#EDE6D4', '#141412', '#0F7A3D', '#8A6B10', '#A03219', '#1F4FA0']) {
    assert.match(css, new RegExp(token.replace('#', '\\#')))
  }
  assert.match(css, /@font-face|Anton/)
  assert.match(css, /Space Mono/)
  assert.match(layout, /staff-skin/)
  assert.match(terminal, /skin-pos/)
  assert.match(login, /skin-login-right/)
})

test('handoff hit targets and behavior seams are represented in production markup', () => {
  assert.match(statsBar, /skin-stats/)
  assert.match(dashboard, /skin-pnl/)
  assert.match(cart, /staff-qty/)
  assert.match(cart, /staff-charge-button/)
  assert.match(cart, /staff-cart-input/)
  assert.match(languageToggle, /variant === 'staff'/)
  assert.match(terminal, /onLongPress=\{handleProductLongPress\}/)
  assert.match(terminal, /setShowScanner\(true\)/)
})

test('storefront is not part of the staff skin seam', () => {
  assert.doesNotMatch(css, /skin-login.*Menu|skin-pos.*Menu/i)
  assert.doesNotMatch(layout, /Menu\.css|storefront/i)
})

test('the shared authenticated staff shell keeps the skin on every staff route', () => {
  assert.match(layout, /const staffSkinEnabled = true/)
  assert.doesNotMatch(layout, /location\.pathname === '\/dashboard'/)
})

test('dark and bright themes remain available across staff entry surfaces', () => {
  assert.match(layout, /<ThemeToggle \/>/)
  assert.match(layout, /<ThemeToggle compact \/>/)
  assert.doesNotMatch(layout, /!staffSkinEnabled\s*&&\s*<ThemeToggle/)
  assert.match(login, /<ThemeToggle compact \/>/)
  assert.match(terminal, /<ThemeToggle compact \/>/)
  assert.match(themeToggle, /aria-label=\{label\}/)
  assert.match(css, /:root\[data-theme="dark"\] \.staff-skin/)
  assert.match(css, /--staff-bg:\s*#0B0B0D/)
})
