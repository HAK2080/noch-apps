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

test('all signed-in employees can receive stock from the open POS terminal', () => {
  const { file, sql } = getLatestStockReceiptFunction()

  assert.match(sql, /auth\.uid\(\)\s+is\s+null/i, `${file} must require a signed-in POS user`)
  assert.doesNotMatch(
    sql,
    /You cannot receive stock for this branch/i,
    `${file} must not reject a signed-in employee because their profile branch is stale or missing`,
  )
  assert.match(
    sql,
    /Employee is not assigned to this branch/i,
    `${file} must preserve branch assignment checks for remote Telegram updates`,
  )
  assert.doesNotMatch(
    sql,
    /(?:p|actor)\.is_active\s+is\s+true|profile is inactive|reporter is not active|Employee is not active/i,
    `${file} must not reject an authenticated employee because of a stale active flag`,
  )
})
