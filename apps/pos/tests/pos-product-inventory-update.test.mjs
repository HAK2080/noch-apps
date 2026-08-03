import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dataUrl = new URL('../src/modules/pos/lib/pos-supabase.js', import.meta.url)
const productsPageUrl = new URL('../src/modules/pos/pages/POSProducts.jsx', import.meta.url)
const inventoryPageUrl = new URL('../src/modules/pos/pages/POSInventory.jsx', import.meta.url)
const terminalUrl = new URL('../src/modules/pos/pages/POSTerminal.jsx', import.meta.url)
const migrationUrl = new URL(
  '../../../supabase/migrations/20260730170000_atomic_pos_product_updates.sql',
  import.meta.url,
)

test('POS management can reload products hidden from the selling grid', async () => {
  const [dataSource, pageSource, inventorySource] = await Promise.all([
    readFile(dataUrl, 'utf8'),
    readFile(productsPageUrl, 'utf8'),
    readFile(inventoryPageUrl, 'utf8'),
  ])

  assert.match(
    dataSource,
    /export async function getPOSProducts\(branchId,\s*\{\s*includeHidden\s*=\s*false\s*\}\s*=\s*\{\}\)/,
  )
  assert.match(pageSource, /getPOSProducts\(branchId,\s*\{\s*includeHidden:\s*true\s*\}\)/)
  assert.match(inventorySource, /getPOSProducts\(branchId,\s*\{\s*includeHidden:\s*true\s*\}\)/)
})

test('manual stock adjustment is one audited database operation', async () => {
  const [dataSource, inventorySource, migrationSource] = await Promise.all([
    readFile(dataUrl, 'utf8'),
    readFile(inventoryPageUrl, 'utf8'),
    readFile(migrationUrl, 'utf8'),
  ])

  assert.match(dataSource, /export async function adjustProductStock\(/)
  assert.match(dataSource, /supabase\.rpc\('adjust_pos_product_stock'/)
  assert.match(inventorySource, /await adjustProductStock\(productId,\s*branchId,\s*newQty/)
  assert.doesNotMatch(inventorySource, /await updateProductStock[\s\S]*await createInventoryMovement/)
  assert.match(migrationSource, /for update/i)
  assert.match(migrationSource, /insert into public\.pos_inventory_movements/i)
  assert.match(migrationSource, /p\.role in \('owner', 'supervisor', 'staff', 'accountant', 'data_entry'\)/)
  assert.match(migrationSource, /staff_branches[\s\S]*sb\.branch_id = p_branch_id/i)
  assert.match(
    migrationSource,
    /movement_type,[\s\S]*quantity,[\s\S]*entered_quantity,[\s\S]*'adjustment',[\s\S]*v_after - v_before,[\s\S]*v_after - v_before,/i,
    'the audit movement must log the adjustment delta, not the resulting stock balance',
  )
})

test('product changes refresh shared-branch terminals and their offline cache', async () => {
  const terminalSource = await readFile(terminalUrl, 'utf8')
  const realtimeSection = terminalSource.slice(
    terminalSource.indexOf('Keep product data live'),
    terminalSource.indexOf('Fetch pending online orders'),
  )

  assert.doesNotMatch(realtimeSection, /filter:\s*`branch_id=eq\.\$\{branchId\}`/)
  assert.match(realtimeSection, /getPOSProducts\(branchId\)/)
  assert.match(realtimeSection, /cacheProducts\(branchId,\s*prods\)/)
})
