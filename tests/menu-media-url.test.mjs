import assert from 'node:assert/strict'
import { test } from 'node:test'
import { menuMediaUrl as posMenuMediaUrl } from '../apps/pos/src/lib/menu-media-url.js'
import { menuMediaUrl as storefrontMenuMediaUrl } from '../apps/storefront/src/lib/menu-media-url.js'

const source = 'https://kxqjasdvoohiexedtfqw.supabase.co/storage/v1/object/public/product-images/products/4d481f28-be35-4fdd-ba49-8e1788858bb5/1791825138132-720.webp'
const target = 'https://noch-menu-media.2080testing.workers.dev/products/4d481f28-be35-4fdd-ba49-8e1788858bb5/1791825138132-720.webp'

for (const [name, translate] of [['POS menu', posMenuMediaUrl], ['storefront', storefrontMenuMediaUrl]]) {
  test(`${name} sends only public product media through R2`, () => {
    assert.equal(translate(source), target)
    assert.equal(translate('https://example.com/photo.webp'), 'https://example.com/photo.webp')
    assert.equal(translate('https://kxqjasdvoohiexedtfqw.supabase.co/storage/v1/object/public/expense-receipts/file.webp'), 'https://kxqjasdvoohiexedtfqw.supabase.co/storage/v1/object/public/expense-receipts/file.webp')
  })
}
