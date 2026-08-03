import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const payrollUrl = new URL('../src/modules/finance/tabs/PayrollTab.jsx', import.meta.url)

test('open payroll exposes an explicit save-draft action that waits for pending edits', async () => {
  const payroll = await readFile(payrollUrl, 'utf8')

  assert.match(payroll, /const pendingSaves = useRef\(new Set\(\)\)/)
  assert.match(payroll, /await Promise\.all\(\[\.\.\.pendingSaves\.current\]\)/)
  assert.match(payroll, /data-testid="save-payroll-draft"/)
  assert.match(payroll, /toast\.success\('Payroll draft saved'\)/)
  assert.match(payroll, /if \(!isDraft \|\| readOnly \|\| !selected\) return/)
})