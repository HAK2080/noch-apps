import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260731203000_inventory_control_authority.sql',
  import.meta.url,
)
const dataUrl = new URL('../src/modules/pos/lib/pos-supabase.js', import.meta.url)
const terminalUrl = new URL('../src/modules/pos/pages/POSTerminal.jsx', import.meta.url)
const inventoryUrl = new URL('../src/modules/pos/pages/POSInventory.jsx', import.meta.url)
const wasteUrl = new URL('../src/modules/pos/pages/POSWaste.jsx', import.meta.url)
const hubUrl = new URL('../src/pages/InventoryHub.jsx', import.meta.url)

test('ingredient estimates require explicit recipes and expose missing evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create or replace function public\.inventory_control_status_v2\(\)/i)
  assert.match(sql, /recipe_usage_status text/i)
  assert.match(sql, /when recipes\.recipe_count > 0[\s\S]*else null/i)
  assert.doesNotMatch(
    sql.slice(
      sql.indexOf('create or replace function public.inventory_theoretical_status'),
      sql.indexOf('create or replace function public.inventory_control_status_v2'),
    ),
    /default_qty_per_serve/i,
  )
})

test('ingredient location counts are atomic, permissioned, and auditable', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create table if not exists public\.inventory_location_stock_movements/i)
  assert.match(sql, /create or replace function public\.record_inventory_location_count/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /movement_type, quantity,[\s\S]*stock_before, stock_after/i)
  assert.match(sql, /p\.role in \('owner', 'supervisor'\)/i)
})

test('product quantities use the location ledger across critical workflows', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  for (const routine of [
    'receive_branch_product_stock',
    'adjust_pos_product_stock',
    'receive_warehouse_stock',
    'receive_transfer',
    'record_received_location_stock',
    'report_waste',
    'mirror_pos_movement_to_location_stock',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${routine}`, 'i'))
  }
  assert.match(sql, /insert into public\.location_product_movements/i)
  assert.match(sql, /sync_product_branch_stock_total/i)
  assert.match(sql, /inventory_control_rollout_log/i)
})

test('POS receiving and adjustment submit the currently open branch', async () => {
  const [dataSource, terminalSource, inventorySource] = await Promise.all([
    readFile(dataUrl, 'utf8'),
    readFile(terminalUrl, 'utf8'),
    readFile(inventoryUrl, 'utf8'),
  ])

  assert.match(dataSource, /rpc\('receive_branch_product_stock'/)
  assert.match(dataSource, /p_branch_id: branchId/)
  assert.match(terminalSource, /receiveProductStock\(branchId, product\.id/)
  assert.match(inventorySource, /adjustProductStock\(productId, branchId, newQty\)/)
  assert.doesNotMatch(inventorySource, /onAdjust\(product\.id, product\.branch_id/)
})

test('waste is limited to tracked location stock and the hub uses authoritative controls', async () => {
  const [wasteSource, hubSource] = await Promise.all([
    readFile(wasteUrl, 'utf8'),
    readFile(hubUrl, 'utf8'),
  ])

  assert.match(wasteSource, /stock_source === 'location_product_stock'/)
  assert.match(wasteSource, /reportWaste\(branchId, product\.id/)
  assert.match(hubSource, /inventory_control_status_v2/)
  assert.match(hubSource, /inventory_control_summary/)
  assert.doesNotMatch(hubSource, /ingredient_consumption/)
})
