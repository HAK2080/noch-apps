import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const owner = '00000000-0000-0000-0000-000000000001'
const staff = '00000000-0000-0000-0000-000000000002'
const branch = '00000000-0000-0000-0000-000000000003'
const readMigration = async name => (await fs.readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
const scalar = async sql => (await db.query(sql)).rows[0]
async function asUser(id) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`)
}
async function enable(value) {
  await asUser(owner)
  await db.query('select public.set_expense_auto_approval($1)', [value])
}
async function submit(payment = 'unpaid', method = null, funding = 'business', status = 'pending') {
  return (await db.query(`insert into expenses(submitted_by, amount, amount_lyd, status,
    payment_status_reported, payment_method_reported, funding_type, paid_by)
    values ($1, 125, 125, $2, $3, $4, $5, $6) returning id`,
  [staff, status, payment, method, funding, funding === 'business' ? 'Business' : 'Owner'])).rows[0].id
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
    grant usage on schema auth to authenticated;
    create table profiles(id uuid primary key, role text);
    insert into profiles values ('${owner}', 'owner'), ('${staff}', 'staff');
    create table pos_branches(id uuid primary key);
    insert into pos_branches values ('${branch}');
    create table pos_settings(branch_id uuid primary key references pos_branches(id), require_pin boolean default true);
    insert into pos_settings(branch_id) values ('${branch}');
    create table expense_categories(id uuid primary key, name text);
    create table expenses(
      id uuid primary key default gen_random_uuid(), submitted_by uuid references profiles not null,
      category_id uuid references expense_categories, amount numeric not null, amount_lyd numeric not null,
      exchange_rate_to_lyd numeric default 1, expense_date date default current_date,
      status text default 'pending' check(status in ('pending','approved','paid','rejected')),
      paid_by text default 'Business', funding_type text default 'business', vendor text, description text,
      paid_at date, payment_account_key text, payment_reference text, payment_notes text,
      payment_journal_batch_id uuid, updated_at timestamptz default now(),
      source text,receipt_url text,submitted_at timestamptz default now()
    );
    create table expense_approvals(id uuid primary key default gen_random_uuid(),
      expense_id uuid not null references expenses(id) on delete cascade,
      acted_by uuid not null references profiles(id), acted_at timestamptz default now(),
      decision text check(decision in ('approved','rejected','paid','auto_approved')), notes text);
    create table expense_snaps(status text);
    create table gl_accounts(id uuid primary key default gen_random_uuid(), code text, key text);
    insert into gl_accounts(code, key) values ('1010','cash'),('1020','bank'),
      ('2300','shareholder_loan'),('3000','owner_capital'),('6000','expense_other_opex');
    create function gl_acct(text) returns uuid language sql as $$ select id from gl_accounts where key = $1 $$;
    create function gl_account_for_expense_name(text) returns uuid language sql as $$ select gl_acct('expense_other_opex') $$;
    create table gl_journal_batches(id uuid primary key default gen_random_uuid(), journal_date date,
      source_type text, source_ref text, branch_id uuid, memo text, status text, created_by uuid);
    create table gl_journal_lines(id uuid primary key default gen_random_uuid(),
      batch_id uuid references gl_journal_batches(id) on delete cascade, account_id uuid not null references gl_accounts,
      branch_id uuid, line_no int, debit_lyd numeric default 0, credit_lyd numeric default 0, memo text);
    create table finance_test_audit(entity text, entity_id uuid, action text);
    create function finance_audit(text, uuid, text, jsonb, jsonb) returns void language sql as
      $$ insert into finance_test_audit values ($1, $2, $3) $$;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    alter table expenses enable row level security;
    create policy expense_access on expenses for all to authenticated using(true) with check(true);
  `)
  // Execute the actual existing accounting functions, not test replacements.
  const accounting = await readMigration('20260615010000_accounting_expense_procurement_workflow')
  await db.exec(accounting.slice(accounting.indexOf('create or replace function mark_expense_paid('),
    accounting.indexOf('-- ---------------------------------------------------------------------------\n-- Manual journal')))
  const funding = await readMigration('20260719170000_shareholder_funding')
  const start = funding.indexOf('create or replace function gl_post_expense(')
  const end = funding.indexOf('grant execute on function gl_post_expense', start)
  await db.exec(funding.slice(start, funding.indexOf(';', end) + 1))
  await db.exec(await readMigration('20260725121000_expense_submitter_payment_declaration'))
  await db.exec(await readMigration('20260911100000_expense_auto_approval_and_pos_instance_setting'))
  await db.exec(await readMigration('20260912130000_scanned_receipt_payment_entry_date'))
})

beforeEach(async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${owner}', false);
    delete from expenses; delete from gl_journal_batches; delete from expense_approval_settings;
    update pos_settings set block_duplicate_tabs = false;`)
})
after(() => db.close())

test('scanned payments use Libya entry date and preserve unpaid/card choices through delayed approval', async () => {
  await asUser(staff)
  for (const [status,method] of [['paid','cash'],['paid','card'],['unpaid',null]]) {
    await db.query(`insert into expenses(submitted_by,amount,amount_lyd,source,receipt_url,expense_date,submitted_at,payment_status_reported,payment_method_reported)
      values($1,125,125,'snap_pwa','receipt.jpg','2020-07-01','2026-09-01T22:30:00Z',$2,$3)`,[staff,status,method])
  }
  await asUser(owner)
  const rows = (await db.query('select id from expenses')).rows
  for (const row of rows) await db.query('select approve_expense_with_reported_payment($1)',[row.id])
  const paid = (await db.query("select paid_at::text,payment_account_key from expenses where status='paid' order by payment_account_key")).rows
  assert.deepEqual(paid,[{paid_at:'2026-09-02',payment_account_key:'bank'},{paid_at:'2026-09-02',payment_account_key:'cash'}])
  assert.equal((await scalar("select count(*)::int n from expenses where status='approved' and paid_at is null")).n,1)
  assert.equal((await scalar('select count(*)::int n from gl_journal_batches')).n,2)
})

test('default off: staff expenses remain pending and POS allows duplicate tabs', async () => {
  await asUser(staff)
  await submit()
  assert.equal((await scalar('select status from expenses')).status, 'pending')
  assert.equal((await scalar('select count(*)::int as n from expense_approvals')).n, 0)
  assert.equal((await scalar('select block_duplicate_tabs from pos_settings')).block_duplicate_tabs, false)
})

test('owner policy approves new employee expenses with attribution and no unpaid cash posting', async () => {
  await enable(true)
  await asUser(staff)
  await submit()
  assert.equal((await scalar('select status from expenses')).status, 'approved')
  const approval = await scalar('select * from expense_approvals')
  assert.equal(approval.acted_by, owner)
  assert.equal(approval.decision, 'auto_approved')
  assert.match(approval.notes, /owner-enabled/)
  assert.equal((await scalar('select count(*)::int as n from gl_journal_batches')).n, 0)
})

for (const [method, funding, account] of [
  ['cash', 'business', 'cash'], ['card', 'business', 'bank'],
  ['cash', 'shareholder_loan', 'shareholder_loan'], ['card', 'capital_injection', 'owner_capital'],
]) {
  test(`reported paid ${method}/${funding} posts one balanced payment and repeated approval is idempotent`, async () => {
    await enable(true)
    await asUser(staff)
    const id = await submit('paid', method, funding)
    assert.equal((await scalar('select status from expenses')).status, 'paid')
    const totals = await scalar('select sum(debit_lyd)::float as debit, sum(credit_lyd)::float as credit from gl_journal_lines')
    assert.deepEqual(totals, { debit: 125, credit: 125 })
    assert.equal((await scalar(`select a.key from gl_journal_lines l join gl_accounts a on a.id=l.account_id where l.credit_lyd > 0`)).key, account)
    await asUser(owner)
    await db.query('select approve_expense_with_reported_payment($1)', [id])
    assert.equal((await scalar('select count(*)::int as n from expense_approvals')).n, 1)
    assert.equal((await scalar('select count(*)::int as n from gl_journal_batches')).n, 1)
  })
}

test('switch changes affect new submissions only, including turning back off', async () => {
  await asUser(staff)
  const pending = await submit()
  await enable(true)
  assert.equal((await db.query('select status from expenses where id=$1', [pending])).rows[0].status, 'pending')
  await asUser(staff)
  await submit()
  await enable(false)
  await asUser(staff)
  await submit()
  assert.deepEqual((await db.query('select status, count(*)::int as n from expenses group by status order by status')).rows,
    [{ status: 'approved', n: 1 }, { status: 'pending', n: 2 }])
})

test('unauthorized and missing-profile actors cannot enable approval or call internal helper', async () => {
  await asUser(staff)
  await assert.rejects(db.query('select set_expense_auto_approval(true)'), /Only an owner/)
  await assert.rejects(db.query(`insert into expense_approval_settings values (true,true,'${staff}',now())`), /permission denied/)
  await assert.rejects(db.query(`select apply_expense_approval(gen_random_uuid(),'${staff}','approved',null)`), /permission denied/)
  const id = await submit()
  await assert.rejects(db.query('select approve_expense_with_reported_payment($1)', [id]), /Only an owner/)
  await asUser('00000000-0000-0000-0000-000000000099')
  await assert.rejects(db.query('select approve_expense_with_reported_payment($1)', [id]), /Only an owner/)
})

test('only owners can change the POS switch, including attempts to delete enabled restriction', async () => {
  await asUser(staff)
  await db.exec('update pos_settings set require_pin=false')
  await assert.rejects(db.exec('update pos_settings set block_duplicate_tabs=true'), /Only an owner/)
  await asUser(owner)
  await db.exec('update pos_settings set block_duplicate_tabs=true')
  await asUser(staff)
  await assert.rejects(db.exec('update pos_settings set block_duplicate_tabs=false'), /Only an owner/)
  await assert.rejects(db.exec('delete from pos_settings'), /Only an owner/)
})

test('payment posting failure rolls back the expense and approval together', async () => {
  await enable(true)
  await asUser(staff)
  await assert.rejects(db.exec(`insert into expenses(submitted_by,amount,amount_lyd,payment_status_reported,payment_method_reported)
    values ('${staff}',0,0,'paid','cash')`), /greater than zero/)
  assert.equal((await scalar('select count(*)::int as n from expenses')).n, 0)
  assert.equal((await scalar('select count(*)::int as n from expense_approvals')).n, 0)
})
