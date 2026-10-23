import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL(
  '../../../supabase/migrations/20261023090000_payroll_attendance_module.sql',
  import.meta.url,
)

const OWNER = '00000000-0000-0000-0000-0000000000aa'
const SALARIED = '00000000-0000-0000-0000-000000000001'
const HOURLY = '00000000-0000-0000-0000-000000000002'
const BRANCH = '00000000-0000-0000-0000-000000000100'

// Minimal stand-ins for the production schema: only what the function reads.
const SCHEMA = `
  create schema if not exists public;
  -- Supabase roles the migration grants to; absent from a bare PGlite instance.
  do $roles$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role;
    end if;
  end $roles$;
  create table public.profiles (
    id uuid primary key, full_name text, role text, is_employee boolean default true,
    payroll_enabled boolean default true, is_active boolean default true,
    start_date date, employment_end_date date, branch_id uuid,
    payroll_cost_center_id uuid, monthly_salary numeric, monthly_salary_lyd numeric,
    hourly_rate_lyd numeric, hourly_rate numeric
  );
  create table public.pos_branches (id uuid primary key, name text);
  create table public.payroll_runs (
    id uuid primary key default gen_random_uuid(), period_month date unique,
    status text, evidence_status text, total_lyd numeric,
    source_snapshot jsonb, created_by uuid
  );
  create table public.payroll_run_items (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references payroll_runs(id) on delete cascade,
    profile_id uuid not null, branch_id uuid,
    base_lyd numeric not null default 0, overtime_lyd numeric not null default 0,
    bonus_lyd numeric not null default 0, deduction_lyd numeric not null default 0,
    loan_repayment_lyd numeric not null default 0, other_lyd numeric not null default 0,
    net_lyd numeric generated always as (
      base_lyd + overtime_lyd + bonus_lyd + other_lyd - deduction_lyd - loan_repayment_lyd
    ) stored,
    note text, pay_basis text, source_hours numeric, source_rate_lyd numeric,
    scheduled_hours numeric, data_status text not null default 'legacy',
    data_issues jsonb not null default '[]'::jsonb,
    manual_hours_per_day numeric, manual_worked_days numeric,
    manual_scheduled_hours numeric, manual_overtime_hours numeric,
    unique (run_id, profile_id)
  );
  create table public.payroll_loan_repayments (
    run_id uuid, run_item_id uuid, loan_id uuid, profile_id uuid, amount_lyd numeric
  );
  create table public.staff_loan_balances (
    loan_id uuid, profile_id uuid, status text, start_month date,
    monthly_repayment_lyd numeric, remaining_lyd numeric
  );
  create table public.shift_labor_cost (
    user_id uuid, hours numeric, labor_cost_lyd numeric,
    clocked_in_at timestamptz, clocked_out_at timestamptz
  );
  create table public.workforce_schedule_shifts (
    profile_id uuid, status text, starts_at timestamptz, ends_at timestamptz
  );
  create table public.pos_shift_attendees (
    user_id uuid, clocked_in_at timestamptz, clocked_out_at timestamptz
  );
  create table public.labor_adjustments (
    profile_id uuid, kind text, amount_lyd numeric, adjustment_date date
  );
  -- The function is security definer and checks auth.uid() for owner.
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable
    as $fn$ select '${OWNER}'::uuid $fn$;
`

async function freshDb() {
  const db = new PGlite()
  await db.exec(SCHEMA)
  const migration = await readFile(migrationUrl, 'utf8')
  // Strip the transaction wrapper; PGlite runs these statements directly.
  await db.exec(migration.replace(/^begin;/m, '').replace(/commit;\s*$/m, ''))
  await db.exec(`
    insert into public.pos_branches values ('${BRANCH}', 'City Walk');
    insert into public.profiles (id, full_name, role, is_employee, payroll_enabled, start_date, branch_id)
      values ('${OWNER}', 'Owner', 'owner', false, false, '2020-01-01', '${BRANCH}');
  `)
  return db
}

const scheduleDays = (profile, days, month = '2026-09') => days.map(day =>
  `insert into public.workforce_schedule_shifts values ('${profile}','published','${month}-${String(day).padStart(2, '0')} 09:00+02','${month}-${String(day).padStart(2, '0')} 18:00+02');`
).join('\n')

const workedDay = (profile, day, hours, cost, month = '2026-09') =>
  `insert into public.shift_labor_cost values ('${profile}',${hours},${cost},'${month}-${String(day).padStart(2, '0')} 09:00+02','${month}-${String(day).padStart(2, '0')} 18:00+02');`

async function runFor(db, month = '2026-09-01') {
  await db.query(`select public.payroll_generate_run('${month}'::date)`)
  const { rows } = await db.query(`
    select p.full_name, i.* from public.payroll_run_items i
    join public.profiles p on p.id = i.profile_id order by p.full_name
  `)
  return rows
}

test('salaried staff with full attendance get full pay and no absence deduction', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, monthly_salary)
        values ('${SALARIED}', 'Amal', 'staff', '2026-01-01', '${BRANCH}', 2600);
      ${scheduleDays(SALARIED, [1, 2, 3, 4])}
      ${[1, 2, 3, 4].map(d => workedDay(SALARIED, d, 9, 0)).join('\n')}
    `)
    const [item] = await runFor(db)

    assert.equal(Number(item.base_lyd), 2600, 'full month salary')
    assert.equal(Number(item.worked_days), 4)
    assert.equal(Number(item.scheduled_days), 4)
    assert.equal(Number(item.absence_days), 0)
    assert.equal(Number(item.absence_deduction_lyd), 0)
    assert.equal(Number(item.overtime_hours), 0, 'exactly 9h/day is not overtime')
    assert.equal(Number(item.overtime_lyd), 0)
    assert.equal(Number(item.net_lyd), 2600)
  } finally { await db.close() }
})

test('a missed scheduled day reduces salaried pay by one scheduled day', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, monthly_salary)
        values ('${SALARIED}', 'Amal', 'staff', '2026-01-01', '${BRANCH}', 2600);
      ${scheduleDays(SALARIED, [1, 2, 3, 4])}
      ${[1, 2, 3].map(d => workedDay(SALARIED, d, 9, 0)).join('\n')}
    `)
    const [item] = await runFor(db)

    // 4 scheduled days, 3 worked: one day of 2600/4 = 650 comes off.
    assert.equal(Number(item.scheduled_days), 4)
    assert.equal(Number(item.worked_days), 3)
    assert.equal(Number(item.absence_days), 1)
    assert.equal(Number(item.absence_deduction_lyd), 650)
    assert.equal(Number(item.base_lyd), 1950)
    assert.equal(Number(item.net_lyd), 1950)
  } finally { await db.close() }
})

test('absence is never deducted without a published schedule to prove it', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, monthly_salary)
        values ('${SALARIED}', 'Amal', 'staff', '2026-01-01', '${BRANCH}', 2600);
      ${workedDay(SALARIED, 1, 9, 0)}
    `)
    const [item] = await runFor(db)

    assert.equal(Number(item.scheduled_days), 0)
    assert.equal(Number(item.absence_days), 0, 'no schedule means no measurable absence')
    assert.equal(Number(item.absence_deduction_lyd), 0)
    assert.equal(Number(item.base_lyd), 2600, 'missing evidence must not invent a deduction')
    assert.ok(item.data_issues.includes('no_published_schedule'), 'the gap is flagged instead')
    assert.equal(item.data_status, 'warning')
  } finally { await db.close() }
})

test('salaried overtime is derived from attendance and paid at x1', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, monthly_salary)
        values ('${SALARIED}', 'Amal', 'staff', '2026-01-01', '${BRANCH}', 2340);
      ${scheduleDays(SALARIED, [1, 2])}
      ${workedDay(SALARIED, 1, 12, 0)}
      ${workedDay(SALARIED, 2, 9, 0)}
    `)
    const [item] = await runFor(db)

    // 2 worked days -> 18h standard; 21h attended -> 3h overtime.
    assert.equal(Number(item.standard_hours), 18)
    assert.equal(Number(item.source_hours), 21)
    assert.equal(Number(item.overtime_hours), 3)
    // Rate = 2340 / (9 * 26) = 10/h, x1 multiplier -> 30.
    assert.equal(Number(item.overtime_lyd), 30)
    assert.equal(Number(item.net_lyd), Number(item.base_lyd) + 30)
  } finally { await db.close() }
})

test('hourly overtime is recorded but adds no pay, because x1 is already in attendance pay', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, hourly_rate_lyd)
        values ('${HOURLY}', 'Bilal', 'staff', '2026-01-01', '${BRANCH}', 10);
      ${scheduleDays(HOURLY, [1])}
      ${workedDay(HOURLY, 1, 12, 120)}
    `)
    const [item] = await runFor(db)

    assert.equal(item.pay_basis, 'hourly')
    assert.equal(Number(item.base_lyd), 120, 'all 12 hours already paid at the hourly rate')
    assert.equal(Number(item.overtime_hours), 3, 'overtime still visible')
    assert.equal(Number(item.overtime_lyd), 0, 'x1 premium adds nothing on top')
    assert.equal(Number(item.net_lyd), 120, 'no double payment')
  } finally { await db.close() }
})

test('manual overtime adjustments still add on top of derived overtime', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, monthly_salary)
        values ('${SALARIED}', 'Amal', 'staff', '2026-01-01', '${BRANCH}', 2340);
      ${scheduleDays(SALARIED, [1])}
      ${workedDay(SALARIED, 1, 12, 0)}
      insert into public.labor_adjustments values ('${SALARIED}','overtime',45,'2026-09-05');
      insert into public.labor_adjustments values ('${SALARIED}','bonus',100,'2026-09-06');
      insert into public.labor_adjustments values ('${SALARIED}','deduction',25,'2026-09-07');
    `)
    const [item] = await runFor(db)

    // 1 worked day -> 9h standard, 12h attended -> 3h x 10 = 30 derived, + 45 manual.
    assert.equal(Number(item.overtime_lyd), 75)
    assert.equal(Number(item.bonus_lyd), 100)
    assert.equal(Number(item.deduction_lyd), 25)
  } finally { await db.close() }
})

test('attendance and schedules share one 05:00 business-day window', async () => {
  const db = await freshDb()
  try {
    // 01 Sep 03:00 local is still the 31 Aug business day and must be excluded;
    // 01 Oct 02:00 local is still the 30 Sep business day and must be included.
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, monthly_salary)
        values ('${SALARIED}', 'Amal', 'staff', '2026-01-01', '${BRANCH}', 2600);
      insert into public.workforce_schedule_shifts values
        ('${SALARIED}','published','2026-09-01 03:00+02','2026-09-01 06:00+02'),
        ('${SALARIED}','published','2026-10-01 02:00+02','2026-10-01 05:00+02');
      insert into public.shift_labor_cost values
        ('${SALARIED}',3,0,'2026-09-01 03:00+02','2026-09-01 06:00+02'),
        ('${SALARIED}',3,0,'2026-10-01 02:00+02','2026-10-01 05:00+02');
    `)
    const [item] = await runFor(db)

    assert.equal(Number(item.scheduled_days), 1, 'only the 30 Sep business day counts')
    assert.equal(Number(item.worked_days), 1)
    assert.equal(Number(item.source_hours), 3, 'the 31 Aug business day is excluded')
  } finally { await db.close() }
})

test('an employee joining mid-month is pro-rated before absence is applied', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, monthly_salary)
        values ('${SALARIED}', 'Amal', 'staff', '2026-09-16', '${BRANCH}', 3000);
      ${scheduleDays(SALARIED, [16, 17, 18])}
      ${[16, 17].map(d => workedDay(SALARIED, d, 9, 0)).join('\n')}
    `)
    const [item] = await runFor(db)

    // 15 of 30 days employed -> 1500; 3 scheduled, 2 worked -> one day of 500 off.
    assert.equal(Number(item.absence_days), 1)
    assert.equal(Number(item.absence_deduction_lyd), 500)
    assert.equal(Number(item.base_lyd), 1000)
  } finally { await db.close() }
})

test('open attendance blocks the run and the snapshot records the policy', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, monthly_salary)
        values ('${SALARIED}', 'Amal', 'staff', '2026-01-01', '${BRANCH}', 2600);
      ${scheduleDays(SALARIED, [1])}
      ${workedDay(SALARIED, 1, 9, 0)}
      insert into public.pos_shift_attendees values ('${SALARIED}','2026-09-02 09:00+02', null);
    `)
    const [item] = await runFor(db)
    assert.equal(item.data_status, 'blocked')
    assert.ok(item.data_issues.includes('open_attendance'))

    const { rows } = await db.query('select evidence_status, source_snapshot from public.payroll_runs')
    assert.equal(rows[0].evidence_status, 'blocked')
    assert.equal(rows[0].source_snapshot.overtime_multiplier, 1)
    assert.equal(rows[0].source_snapshot.business_day_start, '05:00')
  } finally { await db.close() }
})

test('a missing pay basis blocks that employee without inventing a number', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id)
        values ('${SALARIED}', 'Amal', 'staff', '2026-01-01', '${BRANCH}');
    `)
    const [item] = await runFor(db)
    assert.equal(item.pay_basis, 'unconfigured')
    assert.equal(Number(item.base_lyd), 0)
    assert.equal(item.data_status, 'blocked')
    assert.ok(item.data_issues.includes('missing_pay_basis'))
  } finally { await db.close() }
})

test('the run stores the overtime rate it used, and zero for hourly staff', async () => {
  const db = await freshDb()
  try {
    await db.exec(`
      insert into public.profiles (id, full_name, role, start_date, branch_id, monthly_salary)
        values ('${SALARIED}', 'Amal', 'staff', '2026-01-01', '${BRANCH}', 2340);
      insert into public.profiles (id, full_name, role, start_date, branch_id, hourly_rate_lyd)
        values ('${HOURLY}', 'Bilal', 'staff', '2026-01-01', '${BRANCH}', 10);
      ${scheduleDays(SALARIED, [1])}${scheduleDays(HOURLY, [1])}
      ${workedDay(SALARIED, 1, 9, 0)}${workedDay(HOURLY, 1, 9, 90)}
    `)
    const [amal, bilal] = await runFor(db)

    // 2340 / (9 * 26) = 10.00 per hour.
    assert.equal(Number(amal.overtime_rate_lyd), 10)
    assert.equal(Number(bilal.overtime_rate_lyd), 0, 'hourly pay already covers every hour')
  } finally { await db.close() }
})
