import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const createStaffUrl = new URL('../../../supabase/functions/create-staff/index.ts', import.meta.url)
const approveStaffUrl = new URL('../../../supabase/functions/approve-staff-request/index.ts', import.meta.url)
const staffPageUrl = new URL('../src/pages/Staff.jsx', import.meta.url)

test('every staff provisioning path creates a workforce employee', async () => {
  const [createStaff, approveStaff] = await Promise.all([
    readFile(createStaffUrl, 'utf8'),
    readFile(approveStaffUrl, 'utf8'),
  ])

  for (const source of [createStaff, approveStaff]) {
    assert.match(source, /is_employee:\s*true/)
    assert.match(source, /payroll_enabled:\s*true/)
    assert.match(source, /profile:\s*profileRow/)
  }
})

test('staff saves render optimistically and report refresh failures', async () => {
  const source = await readFile(staffPageUrl, 'utf8')

  assert.match(source, /onSave\(savedProfile\)/)
  assert.match(source, /setStaff\(current =>/)
  assert.match(source, /team list could not refresh/)
  assert.doesNotMatch(source, /getAllTeamMembers\(\)\.then\(setStaff\)\.catch\(\(\) => \{\}\)/)
})
