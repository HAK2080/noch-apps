import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const read = relative => fs.readFileSync(path.join(testDir, '..', relative), 'utf8')
const indexHtml = read('index.html')
const layout = read('src/components/Layout.jsx')
const dashboard = read('src/pages/Dashboard.jsx')
const statsBar = read('src/components/dashboard/StatsBar.jsx')
const terminal = read('src/modules/pos/pages/POSTerminal.jsx')
const productGrid = read('src/modules/pos/components/ProductGrid.jsx')
const cart = read('src/modules/pos/components/CartPanel.jsx')
const login = read('src/pages/Login.jsx')
const languageToggle = read('src/components/shared/LanguageToggle.jsx')
const themeToggle = read('src/components/shared/ThemeToggle.jsx')

test('the classic NOCH skin is the active production markup', () => {
  for (const source of [layout, dashboard, statsBar, terminal, productGrid, cart, login, languageToggle, themeToggle]) {
    assert.doesNotMatch(source, /staff-skin|skin-(?:dashboard|stats|pnl|pos|login|wordmark)|staff-(?:product|cart|qty|hold|charge)/)
  }

  assert.match(layout, /bg-gradient-to-br from-green-300 to-emerald-600/)
  assert.match(layout, />noch\.apps</)
  assert.match(login, /min-h-screen bg-noch-dark/)
  assert.match(login, /text-noch-green font-bold text-5xl/)
  assert.match(themeToggle, /rounded-xl/)
  assert.doesNotMatch(indexHtml, /family=Anton|family=Space\+Mono/)
})

test('restoring the classic skin preserves operational behavior', () => {
  assert.match(terminal, /onLongPress=\{handleProductLongPress\}/)
  assert.match(terminal, /setShowScanner\(true\)/)
  assert.match(cart, /customer_phone/)
  assert.match(cart, /onCharge\(\{/)
  assert.match(languageToggle, /toggleLang/)
})
