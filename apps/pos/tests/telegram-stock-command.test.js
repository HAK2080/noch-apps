import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectStockLanguage,
  findStockProductCandidates,
  parseStockReceiptMessage,
} from '../../../supabase/functions/_shared/stock-command.js'

test('parses a natural Arabic stock receipt with Arabic-Indic digits', () => {
  assert.deepEqual(parseStockReceiptMessage('استلمنا ٢٠ تيراميسو'), {
    ok: true,
    language: 'ar',
    quantity: 20,
    productQuery: 'تيراميسو',
  })
})

test('parses natural English and mixed stock receipts', () => {
  assert.deepEqual(parseStockReceiptMessage('received 24 muffins'), {
    ok: true,
    language: 'en',
    quantity: 24,
    productQuery: 'muffins',
  })
  assert.deepEqual(parseStockReceiptMessage('وصل 12 chocolate donut'), {
    ok: true,
    language: 'ar',
    quantity: 12,
    productQuery: 'chocolate donut',
  })
})

test('parses English and Arabic receiving units without treating them as product names', () => {
  assert.deepEqual(parseStockReceiptMessage('received 3 kg Ghadamis coffee'), {
    ok: true,
    language: 'en',
    quantity: 3,
    unit: 'kg',
    productQuery: 'Ghadamis coffee',
  })
  assert.deepEqual(parseStockReceiptMessage('استلمنا 2500 غرام قهوة غدامس'), {
    ok: true,
    language: 'ar',
    quantity: 2500,
    unit: 'g',
    productQuery: 'قهوة غدامس',
  })
})

test('requires both a positive quantity and product name', () => {
  assert.equal(parseStockReceiptMessage('تيراميسو').error, 'missing_quantity')
  assert.equal(parseStockReceiptMessage('20').error, 'missing_product')
  assert.equal(parseStockReceiptMessage('0 donut').error, 'invalid_quantity')
})

test('matches Arabic or English POS names and keeps ambiguous products', () => {
  const products = [
    { id: '1', name: 'Chocolate Donut', name_ar: 'دونات شوكولاتة' },
    { id: '2', name: 'Pistachio Donut', name_ar: 'دونات فستق' },
    { id: '3', name: 'Tiramisu', name_ar: 'تيراميسو' },
  ]

  assert.equal(findStockProductCandidates(products, 'تيراميسو')[0].product.id, '3')
  assert.deepEqual(findStockProductCandidates(products, 'donut').map(match => match.product.id), ['1', '2'])
  assert.equal(detectStockLanguage('20 tiramisu'), 'en')
})
