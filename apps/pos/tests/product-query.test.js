import assert from 'node:assert/strict'
import test from 'node:test'

import { ALL_PRODUCTS_SELECT } from '../src/modules/pos/lib/product-query.js'

test('product catalog query excludes the ambiguous legacy branch relationship', () => {
  assert.match(ALL_PRODUCTS_SELECT, /pos_categories/)
  assert.doesNotMatch(ALL_PRODUCTS_SELECT, /pos_branches/)
})
