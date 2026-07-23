import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260724090000_owner_product_cost_access.sql',
  import.meta.url,
)

test('owner product-cost access is independent from employee active status', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /profile\.role = 'owner'/)
  assert.match(
    sql,
    /profile\.role in \('accountant', 'data_entry'\)\s+and coalesce\(profile\.is_active, true\)/,
  )
  assert.doesNotMatch(
    sql,
    /profile\.role in \('owner', 'accountant', 'data_entry'\)\s+and coalesce\(profile\.is_active, true\)/,
  )
})
