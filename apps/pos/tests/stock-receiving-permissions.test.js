import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const migrationsDirectory = path.resolve(testDirectory, '../../../supabase/migrations')

function getLatestStockReceiptFunction() {
  const migrationFiles = fs.readdirSync(migrationsDirectory)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .reverse()

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDirectory, file), 'utf8')
    const functionMatch = sql.match(/create(?: or replace)? function public\.receive_pos_product_stock/i)
    if (functionMatch) return { file, sql: sql.slice(functionMatch.index) }
  }

  throw new Error('receive_pos_product_stock migration not found')
}

test('all signed-in employees can receive stock within their assigned branches', () => {
  const { file, sql } = getLatestStockReceiptFunction()

  assert.match(sql, /p\.id = auth\.uid\(\)/, `${file} must authorize the signed-in profile`)
  assert.match(sql, /p\.branch_id = v_product\.branch_id|staff_branches/, `${file} must preserve branch access`)
  assert.doesNotMatch(
    sql,
    /(?:p|actor)\.is_active\s+is\s+true|profile is inactive|reporter is not active|Employee is not active/i,
    `${file} must not reject an authenticated employee because of a stale active flag`,
  )
})
