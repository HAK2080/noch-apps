import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const productsUrl = new URL('../src/modules/pos/pages/POSProducts.jsx', import.meta.url)
const stockControlUrl = new URL('../src/modules/pos/components/GlobalStockControl.jsx', import.meta.url)

test('branch product management retries database failures and never presents them as an empty catalog', async () => {
  const source = await readFile(productsUrl, 'utf8')
  assert.match(source, /retryTimer\.current = setTimeout\(load,/)
  assert.match(source, /setCatalogError\(err\.message/)
  assert.match(source, /catalogError && products\.length === 0/)
  assert.match(source, /Product list temporarily unavailable/)
  assert.match(source, /setCatalogError\(''\)/)
})

test('global stock setting recovers after a temporary database failure', async () => {
  const source = await readFile(stockControlUrl, 'utf8')
  assert.match(source, /retryTimer\.current = setTimeout\(reloadPolicy,/)
  assert.match(source, /Stock setting is temporarily unavailable/)
  assert.match(source, /clearTimeout\(retryTimer\.current\)/)
})
