import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const staffUrl = new URL('../src/pages/Staff.jsx', import.meta.url)
const createStaffUrl = new URL('../../../supabase/functions/create-staff/index.ts', import.meta.url)

const staffSource = await readFile(staffUrl, 'utf8')

test('saving a staff member writes the payroll enrolment flags, including on edit', () => {
  // Both columns default to false, and payroll only sees a profile with both
  // on. They must be in the shared payload, not only in a create-path object,
  // or an existing profile can never be brought into payroll from this screen.
  const payloadStart = staffSource.indexOf('const payload = {')
  const payloadEnd = staffSource.indexOf('}', staffSource.indexOf('is_active: form.is_active'))
  const payload = staffSource.slice(payloadStart, payloadEnd)

  assert.match(payload, /is_employee: !!form\.in_payroll/)
  assert.match(payload, /payroll_enabled: !!form\.in_payroll/)
})

test('the edit form seeds enrolment from the saved profile and new staff default in', () => {
  assert.match(staffSource, /in_payroll: staff\.is_employee !== false && staff\.payroll_enabled !== false/)
  assert.match(staffSource, /days_off: \[\], overtime_exempt: false, in_payroll: true/)
})

test('enrolment is visible and switchable, not an invisible database flag', () => {
  assert.match(staffSource, /function PayrollReadiness/)
  assert.match(staffSource, /Include in payroll/)
  assert.match(staffSource, /onToggle\(e\.target\.checked\)/)
  assert.match(staffSource, /<PayrollReadiness/)
})

test('readiness mirrors the conditions payroll actually blocks on', () => {
  const start = staffSource.indexOf('function payrollBlockers')
  const body = staffSource.slice(start, staffSource.indexOf('function PayrollReadiness'))

  assert.match(body, /a start date/)
  assert.match(body, /a monthly salary or an hourly rate/)
  assert.match(body, /a branch or payroll allocation/)
})

test('only the name is required to employ someone', () => {
  assert.match(staffSource, /if \(!form\.full_name\.trim\(\)\) \{ toast\.error\('Name required'\); return \}/)

  // No sign-in or contact detail may be mandatory.
  assert.doesNotMatch(staffSource, /!form\.phone\.trim\(\)[^)]*toast\.error/)
  assert.doesNotMatch(staffSource, /!form\.pin_code\.trim\(\)[^)]*toast\.error/)
  // A PIN is validated only when one was actually typed.
  assert.match(staffSource, /if \(pinValue && !\/\^\\d\{4,6\}\$\/\.test\(pinValue\)\)/)
})

test('sign-in and contact fields are folded away behind an optional section', () => {
  const summaryIndex = staffSource.indexOf('App &amp; POS access')
  assert.ok(summaryIndex > 0, 'optional access section should exist')
  assert.match(staffSource.slice(summaryIndex, summaryIndex + 400), /optional — PIN, login, phone, Telegram/)

  const section = staffSource.slice(staffSource.indexOf('<details'), staffSource.indexOf('</details>'))
  for (const field of ['pin_code', 'telegram_chat_id', "set('phone'", 'Account Setup']) {
    assert.ok(section.includes(field), `${field} belongs in the optional section`)
  }

  // The employment facts payroll needs stay out in the open.
  const core = staffSource.slice(staffSource.indexOf('Full Name *'), staffSource.indexOf('<details'))
  for (const field of ["set('start_date'", "set('branch_id'", "set('employment_type'"]) {
    assert.ok(core.includes(field), `${field} should stay in the main form`)
  }
})

test('newly created staff are still enrolled by the create-staff function', async () => {
  const createSource = await readFile(createStaffUrl, 'utf8')
  assert.match(createSource, /is_employee: true/)
  assert.match(createSource, /payroll_enabled: true/)
})
