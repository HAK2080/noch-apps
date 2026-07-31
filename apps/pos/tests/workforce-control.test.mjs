import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260731230000_workforce_control_v2.sql',
  import.meta.url,
)
const appUrl = new URL('../src/App.jsx', import.meta.url)
const hubUrl = new URL('../src/modules/workforce/pages/WorkforceHub.jsx', import.meta.url)
const profilesUrl = new URL('../src/lib/profiles.js', import.meta.url)
const financeUrl = new URL('../src/modules/finance/FinanceDashboard.jsx', import.meta.url)

test('workforce identity is explicit and owner login profiles are not employees', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /add column if not exists is_employee boolean/)
  assert.match(sql, /where profile\.is_employee/)
  assert.match(sql, /where role in \('staff', 'limited_staff', 'supervisor', 'accountant', 'data_entry'\)/)
  assert.match(sql, /add column if not exists employment_end_date date/)
})

test('open attendance never silently becomes paid time', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /when attendee\.clocked_out_at is null then null/)
  assert.match(sql, /clocked_out_at <= clocked_in_at \+ interval '24 hours'/)
  assert.match(sql, /pos_shift_attendees_one_open_idx/)
  assert.match(sql, /workforce_attendance_corrections/)
})

test('schedule is separate evidence and payroll has approval and payment states', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /workforce_schedule_shifts/)
  assert.match(sql, /status in \('draft', 'published', 'cancelled'\)/)
  assert.match(sql, /status in \('draft', 'completed', 'paid'\)/)
  assert.match(sql, /payroll_record_payment_v2/)
  assert.match(sql, /Staff loans receivable/)
  assert.match(sql, /run\.status in \('completed', 'paid'\)/)
})

test('normal owner journey is consolidated under staff workforce control', async () => {
  const [app, hub, profiles, finance] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(hubUrl, 'utf8'),
    readFile(profilesUrl, 'utf8'),
    readFile(financeUrl, 'utf8'),
  ])
  assert.match(app, /path="\/staff".*WorkforceHub/s)
  assert.match(app, /path="\/staff\/team".*Staff/s)
  assert.match(hub, /Tripoli business day starts at 05:00/)
  assert.match(hub, /الفريق والحضور والرواتب/)
  assert.match(profiles, /rpc\('workforce_team_v2'\)/)
  assert.doesNotMatch(finance, /ShiftsTab|PayrollTab/)
})
