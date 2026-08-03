import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260802210000_employee_visibility_and_payroll_reopen.sql',
  import.meta.url,
)
const payrollPageUrl = new URL('../src/modules/finance/tabs/PayrollTab.jsx', import.meta.url)
const financeDataUrl = new URL('../src/modules/finance/lib/finance-supabase.js', import.meta.url)

test('reopening payroll is owner-only, unpaid-only, and journal-audited', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create or replace function public\.payroll_reopen_run_v2/)
  assert.match(sql, /profile\.role = 'owner'/)
  assert.match(sql, /run_row\.status = 'paid'[\s\S]*cannot be reopened/)
  assert.match(sql, /set source_ref = 'approval:'/)
  assert.match(sql, /'reversal:' \|\| p_run_id::text/)
  assert.match(sql, /line\.credit_lyd,[\s\S]*line\.debit_lyd/)
  assert.match(sql, /set status = 'draft'/)
})

test('completed payroll exposes an explicit reopen control', async () => {
  const [page, data] = await Promise.all([
    readFile(payrollPageUrl, 'utf8'),
    readFile(financeDataUrl, 'utf8'),
  ])

  assert.match(data, /export async function reopenPayrollRun/)
  assert.match(data, /payroll_reopen_run_v2/)
  assert.match(page, /selected\.status === 'completed'/)
  assert.match(page, /Reopen payroll/)
  assert.match(page, /Paid payroll cannot be reopened/)
})
