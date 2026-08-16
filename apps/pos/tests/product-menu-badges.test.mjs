import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  getProductMenuBadge,
  normalizeProductMenuBadgeAnimation,
  PRODUCT_MENU_BADGE_ANIMATIONS,
  PRODUCT_MENU_BADGES,
} from '../src/lib/product-menu-badges.js'

const menuUrl = new URL('../src/pages/storefront/Menu.jsx', import.meta.url)
const menuCssUrl = new URL('../src/pages/storefront/styles/Menu.css', import.meta.url)
const productCatalogUrl = new URL('../src/pages/ProductCatalog.jsx', import.meta.url)
const posProductsUrl = new URL('../src/modules/pos/pages/POSProducts.jsx', import.meta.url)
const migrationUrl = new URL('../../../supabase/migrations/20260816150000_product_menu_badges.sql', import.meta.url)

test('customer-menu badges provide the five requested bilingual messages', () => {
  assert.deepEqual(PRODUCT_MENU_BADGES.map(badge => badge.key), [
    'new', 'limited', 'back_in_stock', 'popular', 'must_try',
  ])
  assert.equal(getProductMenuBadge('new', 'en').label, 'NEW')
  assert.equal(getProductMenuBadge('new', 'ar').label, 'جديد')
  assert.equal(getProductMenuBadge('back_in_stock', 'ar').label, 'عاد من جديد')
  assert.equal(getProductMenuBadge('popular', 'ar').label, 'الأكثر طلباً')
  assert.equal(getProductMenuBadge('must_try', 'ar').label, 'لازم تجربها')
  assert.equal(getProductMenuBadge('unknown', 'en'), null)
})

test('badge animation choice is constrained and has a dazzling fallback', () => {
  assert.deepEqual(PRODUCT_MENU_BADGE_ANIMATIONS.map(animation => animation.key), [
    'dazzle', 'shimmer', 'pulse', 'float',
  ])
  assert.equal(normalizeProductMenuBadgeAnimation('float'), 'float')
  assert.equal(normalizeProductMenuBadgeAnimation('unknown'), 'dazzle')
})

test('both product editors persist a changeable badge and animation', async () => {
  const [catalog, posProducts] = await Promise.all([
    readFile(productCatalogUrl, 'utf8'),
    readFile(posProductsUrl, 'utf8'),
  ])

  for (const source of [catalog, posProducts]) {
    assert.match(source, /Animated (?:customer-)?menu tag/i)
    assert.match(source, /menu_badge_key: form\.menu_badge_key \|\| null/)
    assert.match(source, /menu_badge_animation: normalizeProductMenuBadgeAnimation/)
    assert.match(source, /PRODUCT_MENU_BADGES\.map/)
    assert.match(source, /PRODUCT_MENU_BADGE_ANIMATIONS\.map/)
  }
})

test('customer menu renders animated badges everywhere and respects reduced motion', async () => {
  const [menu, css] = await Promise.all([
    readFile(menuUrl, 'utf8'),
    readFile(menuCssUrl, 'utf8'),
  ])

  assert.match(menu, /function ProductMenuBadge/)
  assert.match(menu, /data-kind=\{badge\.key\}/)
  assert.match(menu, /data-animation=\{normalizeProductMenuBadgeAnimation/)
  assert.ok((menu.match(/<ProductMenuBadge/g) || []).length >= 6)
  assert.match(css, /@keyframes menu-badge-dazzle/)
  assert.match(css, /@keyframes menu-badge-shimmer/)
  assert.match(css, /@keyframes menu-badge-pulse/)
  assert.match(css, /@keyframes menu-badge-float/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.menu-highlight-badge/)
})

test('database migration constrains badge and animation values', async () => {
  const migration = await readFile(migrationUrl, 'utf8')

  assert.match(migration, /add column if not exists menu_badge_key text/)
  assert.match(migration, /add column if not exists menu_badge_animation text not null default 'dazzle'/)
  assert.match(migration, /menu_badge_key in \('new', 'limited', 'back_in_stock', 'popular', 'must_try'\)/)
  assert.match(migration, /menu_badge_animation in \('dazzle', 'shimmer', 'pulse', 'float'\)/)
})
