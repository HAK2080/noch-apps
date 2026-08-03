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
const payrollUrl = new URL('../src/modules/finance/tabs/PayrollTab.jsx', import.meta.url)
const payrollCalculationsUrl = new URL('../src/modules/finance/lib/payroll-calculations.js', import.meta.url)
const payrollPdfUrl = new URL('../src/modules/finance/lib/payroll-pdf.js', import.meta.url)
const manualHoursMigrationUrl = new URL(
  '../../../supabase/migrations/20260801090000_payroll_manual_hours.sql',
  import.meta.url,
)
const overtimeHoursMigrationUrl = new URL(
  '../../../supabase/migrations/20260801110000_payroll_overtime_hours_x1.sql',
  import.meta.url,
)

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
  const [app, hub, profiles, finance, payroll] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(hubUrl, 'utf8'),
    readFile(profilesUrl, 'utf8'),
    readFile(financeUrl, 'utf8'),
    readFile(payrollUrl, 'utf8'),
  ])
  assert.match(app, /path="\/staff".*WorkforceHub/s)
  assert.match(app, /path="\/staff\/team".*Staff/s)
  assert.match(hub, /Tripoli business day starts at 05:00/)
  assert.match(hub, /Ø§Ù„ÙØ±ÙŠÙ‚ ÙˆØ§Ù„Ø­Ø¶ÙˆØ± ÙˆØ§Ù„Ø±ÙˆØ§ØªØ¨/)
  assert.match(profiles, /rpc\('workforce_team_v2'\)/)
  assert.doesNotMatch(finance, /ShiftsTab|PayrollTab/)
  assert.match(payroll, /getAllTeamMembers\(\)/)
  assert.match(payroll, /disabled=\{busy \|\| !canComplete\}/)
  assert.match(payroll, /Open team directory to add dates/)
  assert.match(payroll, /missing_start_date/)
  assert.match(payroll, /Evidence/)
  assert.match(payroll, /updatePayrollRunItemHours/)
  assert.match(payroll, /data-testid="save-payroll-draft"/)
  assert.match(payroll, /toast.success\('Payroll draft saved'\)/)
  assert.match(payroll, /Hours\/day/)
  assert.match(payroll, /Attendance and schedules are optional evidence/)
  assert.match(payroll, /updatePayrollRunItemHours/)
  assert.doesNotMatch(payroll, /Math\.abs\(storedVariance\) <= 0\.005/)
  assert.match(payroll, /MANUAL_MONEY_FIELDS = \['base_lyd', 'bonus_lyd'.*'deduction_lyd'.*'loan_repayment_lyd'/s)
  assert.doesNotMatch(payroll, /MANUAL_MONEY_FIELDS = \[[^\]]*'overtime_lyd'/s)
  assert.match(payroll, /OT cost \(Ã—1\)/)
})

test('manual payroll hours are stored and calculated without attendance evidence', async () => {
  const sql = await readFile(manualHoursMigrationUrl, 'utf8')
  assert.match(sql, /manual_hours_per_day numeric/)
  assert.match(sql, /manual_worked_days numeric/)
  assert.match(sql, /manual_scheduled_hours numeric/)
  assert.match(sql, /manual_overtime_hours numeric/)
  assert.match(sql, /payroll_update_item_hours_v2/)
  assert.match(sql, /p_hours_per_day numeric default null/)
  assert.match(sql, /p_worked_days numeric default null/)
  assert.match(sql, /worked_hours := case/)
  assert.match(sql, /then round\(worked_hours \* profile_rate, 2\)/)
  assert.match(sql, /payroll hours cannot be negative/)
  assert.match(sql, /run\.status = 'draft'/)
})

test('payroll employee fields wrap inside cards without a horizontal table scroller', async () => {
  const [hub, payroll] = await Promise.all([
    readFile(hubUrl, 'utf8'),
    readFile(payrollUrl, 'utf8'),
  ])

  assert.doesNotMatch(payroll, /card overflow-x-auto/)
  assert.doesNotMatch(payroll, /<table className="w-full text-xs"/)
  assert.match(payroll, /data-testid="payroll-item-card"/)
  assert.match(payroll, /2xl:grid-cols-11/)
  assert.match(payroll, /className="input[^\"]*w-full[^\"]*min-w-0/)
  assert.match(hub, /tab === 'payroll' \? 'max-w-none' : 'max-w-7xl'/)
})

test('manual overtime hours calculate overtime cost at the snapshotted hourly rate times one', async () => {
  const [sql, payroll, calculations] = await Promise.all([
    readFile(overtimeHoursMigrationUrl, 'utf8'),
    readFile(payrollUrl, 'utf8'),
    import(payrollCalculationsUrl),
  ])

  assert.match(sql, /profile_rate := coalesce\(item_row\.source_rate_lyd, profile_rate, 0\)/)
  assert.match(sql, /when p_overtime_hours is not null\s+then round\(p_overtime_hours \* profile_rate \* 1, 2\)/s)
  assert.match(sql, /manual_overtime_hours = p_overtime_hours/)
  assert.match(payroll, /\['manual_overtime_hours', 'OT hours \(Ã—1\)'\]/)
  assert.equal(calculations.overtimeCostOf({ manual_overtime_hours: 3.5, source_rate_lyd: 20 }), 70)
  assert.equal(calculations.overtimeCostOf({ manual_overtime_hours: '', source_rate_lyd: 20, overtime_lyd: 90 }), 0)
  assert.equal(calculations.overtimeCostOf({ manual_overtime_hours: null, overtime_lyd: 90 }), 90)
  assert.equal(calculations.netOf({ base_lyd: 1000, manual_overtime_hours: 3, source_rate_lyd: 20 }), 1060)
  assert.match(payroll, /overtimeHours: item\.manual_overtime_hours === '' \? 0/)
  assert.match(payroll, /data-testid="overtime-cost"/)
})

test('selecting a previous payroll month opens its existing draft for editing', async () => {
  const [payroll, workforceSql] = await Promise.all([
    readFile(payrollUrl, 'utf8'),
    readFile(migrationUrl, 'utf8'),
  ])

  assert.match(payroll, /const selectMonth = value =>/)
  assert.match(payroll, /runs\.find\(run => String\(run\.period_month\)\.slice\(0, 7\) === value\)/)
  assert.match(payroll, /if \(existingRun\) openRun\(existingRun\)/)
  assert.match(payroll, /onChange=\{event => selectMonth\(event\.target\.value\)\}/)
  assert.doesNotMatch(workforceSql, /month_start\s*[<>=]+\s*current_date/)
})

test('payroll provides combined and per-employee professional PDF exports', async () => {
  const [payroll, pdf] = await Promise.all([
    readFile(payrollUrl, 'utf8'),
    import(payrollPdfUrl),
  ])
  const item = {
    id: 'item-1',
    profile_id: 'profile-1',
    branch_id: 'branch-1',
    base_lyd: 1000,
    manual_hours_per_day: 8,
    manual_worked_days: 20,
    manual_overtime_hours: 3,
    source_rate_lyd: 20,
    bonus_lyd: 50,
    deduction_lyd: 10,
    loan_repayment_lyd: 25,
    other_lyd: 5,
    data_status: 'warning',
    note: 'Manual payroll entry',
  }
  const context = {
    run: { period_month: '2026-07-01', status: 'draft' },
    items: [item],
    nameOf: () => 'Amina Hassan',
    branchOf: () => 'City Walk',
  }
  const combined = pdf.buildPayrollPdfHtml(context)
  const single = pdf.buildPayrollPdfHtml({ ...context, employeeId: item.profile_id })
  assert.match(payroll, /data-testid="export-payroll-pdf"/)
  assert.match(payroll, /data-testid="export-paystub-pdf"/)
  assert.match(payroll, /openPayrollPdf/)
  assert.match(combined, /Payroll report/)
  assert.match(combined, /Finance team copy/)
  assert.match(combined, /Amina Hassan/)
  assert.match(combined, /Overtime x1/)
  assert.match(combined, /60\.00 LYD/)
  assert.match(single, /Employee pay stub/)
  assert.doesNotMatch(combined, /Approval|Signature|ØªÙˆÙ‚ÙŠØ¹|Ø§Ø¹ØªÙ…Ø§Ø¯/)
})