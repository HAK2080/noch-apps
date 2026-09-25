import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migration = await fs.readFile(new URL('../../../supabase/migrations/20260912180000_accounting_posting_accuracy.sql', import.meta.url), 'utf8')
const businessDayMigration = await fs.readFile(new URL('../../../supabase/migrations/20260925120000_gl_business_day_posting.sql', import.meta.url), 'utf8')
const rows = async (sql) => (await db.query(sql)).rows

before(async () => {
  await db.exec(`
    create role authenticated; create role service_role;
    create table profiles(id uuid primary key);
    create table pos_branches(id uuid primary key,is_active boolean);
    create table gl_accounts(id uuid primary key default gen_random_uuid(),code text unique);
    create table gl_account_map(key text primary key,account_id uuid references gl_accounts);
    create table gl_settings(id text primary key,auto_post_enabled boolean,last_synced_date date,updated_at timestamptz);
    create table gl_journal_batches(id uuid primary key default gen_random_uuid(),journal_date date,source_type text,source_ref text,branch_id uuid,memo text,status text,total_debit numeric default 0,total_credit numeric default 0);
    create unique index gl_source on gl_journal_batches(source_type,source_ref,coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)) where source_ref is not null;
    create table gl_journal_lines(id uuid primary key default gen_random_uuid(),batch_id uuid references gl_journal_batches on delete cascade,account_id uuid,branch_id uuid,line_no int,debit_lyd numeric default 0,credit_lyd numeric default 0,memo text);
    create function recompute() returns trigger language plpgsql as $$begin update gl_journal_batches set total_debit=(select coalesce(sum(debit_lyd),0) from gl_journal_lines where batch_id=coalesce(new.batch_id,old.batch_id)),total_credit=(select coalesce(sum(credit_lyd),0) from gl_journal_lines where batch_id=coalesce(new.batch_id,old.batch_id)) where id=coalesce(new.batch_id,old.batch_id); return null; end$$;
    create trigger recompute_lines after insert or update or delete on gl_journal_lines for each row execute function recompute();
    create table pos_orders(id uuid primary key,branch_id uuid,status text,subtotal numeric,discount_amount numeric,total numeric);
    create table pos_products(id uuid primary key,cost_lyd numeric);
    create table pos_order_items(id uuid primary key,order_id uuid,product_id uuid,quantity numeric);
    create table pos_tender_events(id uuid primary key default gen_random_uuid(),branch_id uuid,order_id uuid,event_type text,tender_type text,signed_amount_lyd numeric,occurred_at timestamptz);
    create table expense_categories(id uuid primary key,name text);
    create table expense_entries(id uuid primary key,amount_lyd numeric,paid_at date,branch_id uuid,category text,vendor text,notes text,status text);
    create table expenses(id uuid primary key,amount_lyd numeric,amount numeric,exchange_rate_to_lyd numeric,paid_at date,expense_date date,receipt_url text,source text,submitted_at timestamptz,category_id uuid,vendor text,description text,status text,funding_type text,payment_account_key text,payment_status_reported text);
    create table bank_transactions(id uuid primary key default gen_random_uuid(),account_label text,posted_at date,amount_lyd numeric,description text);
    insert into gl_settings values('default',false,null,now());
    insert into gl_accounts(code) values('1010'),('1020'),('1025'),('1040'),('1200'),('1500'),('4010'),('4090'),('4095'),('5010'),('6100'),('6900'),('2300'),('3000');
    insert into gl_account_map select x.key,a.id from (values('cash','1010'),('card_clearing','1020'),('presto_clearing','1025'),('bank','1040'),('inventory','1200'),('capex_fixed_assets','1500'),('sales_revenue','4010'),('sales_discount','4090'),('sales_refund','4095'),('cogs','5010'),('expense_rent','6100'),('expense_other_opex','6900')) x(key,code) join gl_accounts a using(code);
    create function gl_acct(p_key text) returns uuid language sql stable as $$select account_id from gl_account_map where key=p_key$$;
    create function gl_account_for_expense_name(p_name text) returns uuid language sql stable as $$select coalesce(gl_acct(case when p_name ilike 'rent%' then 'expense_rent' else 'expense_other_opex' end),gl_acct('expense_other_opex'))$$;
  `)
  await db.exec(migration)
  await db.exec(businessDayMigration)
})

after(async () => db.close())

test('sales and dated card refund produce separate balanced immutable batches', async () => {
  await db.exec(`
    insert into pos_branches values('00000000-0000-0000-0000-000000000001',true);
    insert into pos_products values('00000000-0000-0000-0000-000000000002',20);
    insert into pos_orders values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','completed',100,10,90);
    insert into pos_order_items values('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002',2);
    insert into pos_tender_events(branch_id,order_id,event_type,tender_type,signed_amount_lyd,occurred_at) values
      ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','sale','cash',40,'2026-09-01 10:00+02'),
      ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','sale','card',50,'2026-09-01 10:00+02'),
      ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','refund','card',-20,'2026-09-02 11:00+02');
  `)
  const [sale] = await rows("select gl_post_sales_day('2026-09-01','00000000-0000-0000-0000-000000000001') id")
  const [refund] = await rows("select gl_post_sales_day('2026-09-02','00000000-0000-0000-0000-000000000001') id")
  assert.notEqual(sale.id, refund.id)
  const totals = await rows(`select journal_date,total_debit,total_credit from gl_journal_batches order by journal_date`)
  assert.deepEqual(totals.map(x => [x.journal_date.toISOString().slice(0,10),Number(x.total_debit),Number(x.total_credit)]), [['2026-09-01',140,140],['2026-09-02',20,20]])
  const [again] = await rows("select gl_post_sales_day('2026-09-01','00000000-0000-0000-0000-000000000001') id")
  assert.equal(again.id,sale.id)
})

test('sales either side of 05:00 Tripoli post to the correct business days', async () => {
  await db.exec(`
    insert into pos_branches values('00000000-0000-0000-0000-000000000021',true);
    insert into pos_orders values
      ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000021','completed',10,0,10),
      ('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000021','completed',20,0,20);
    insert into pos_tender_events(branch_id,order_id,event_type,tender_type,signed_amount_lyd,occurred_at) values
      ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000022','sale','cash',10,'2026-09-03 04:59+02'),
      ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000023','sale','card',20,'2026-09-03 05:00+02'),
      ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000023','refund','card',-5,'2026-09-04 04:59+02');
  `)
  const [before] = await rows("select gl_post_sales_day('2026-09-02','00000000-0000-0000-0000-000000000021') id")
  const [after] = await rows("select gl_post_sales_day('2026-09-03','00000000-0000-0000-0000-000000000021') id")
  const journals = await rows(`
    select b.journal_date, a.code, l.debit_lyd, l.credit_lyd
    from gl_journal_batches b
    join gl_journal_lines l on l.batch_id=b.id
    join gl_accounts a on a.id=l.account_id
    where b.id in ('${before.id}','${after.id}') and a.code in ('1010','1020')
    order by b.journal_date
  `)
  assert.deepEqual(journals.map(x => [x.journal_date.toISOString().slice(0,10),x.code,Number(x.debit_lyd)]), [
    ['2026-09-02','1010',10],
    ['2026-09-03','1020',15],
  ])
  const [refund] = await rows(`select l.debit_lyd from gl_journal_lines l join gl_accounts a on a.id=l.account_id where l.batch_id='${after.id}' and a.code='4095'`)
  assert.equal(Number(refund.debit_lyd),5)
  const [settings] = await rows("select auto_post_enabled, last_synced_date from gl_settings where id='default'")
  assert.equal(settings.auto_post_enabled,false)
  assert.equal(settings.last_synced_date,null)
})

test('nightly posting waits until the 05:00 business-day boundary', async () => {
  const dates = await rows(`
    select
      gl_last_closed_business_day('2026-09-25 04:59+02') before_cutoff,
      gl_last_closed_business_day('2026-09-25 05:00+02') after_cutoff
  `)
  assert.deepEqual([
    dates[0].before_cutoff.toISOString().slice(0,10),
    dates[0].after_cutoff.toISOString().slice(0,10),
  ], ['2026-09-23','2026-09-24'])
})

test('paid bank expense posts on payment date; approved unpaid expense does not post', async () => {
  await db.exec(`
    insert into expense_categories values('00000000-0000-0000-0000-000000000010','Rent');
    insert into expenses(id,amount_lyd,expense_date,paid_at,category_id,status,payment_account_key) values
      ('00000000-0000-0000-0000-000000000011',30,'2026-08-20','2026-09-03','00000000-0000-0000-0000-000000000010','paid','bank'),
      ('00000000-0000-0000-0000-000000000012',40,'2026-09-03',null,'00000000-0000-0000-0000-000000000010','approved',null);
  `)
  const [paid] = await rows("select gl_post_expense('00000000-0000-0000-0000-000000000011','expenses') id")
  const [unpaid] = await rows("select gl_post_expense('00000000-0000-0000-0000-000000000012','expenses') id")
  assert.ok(paid.id)
  assert.equal(unpaid.id,null)
  const [entry] = await rows(`select b.journal_date,a.code,l.credit_lyd from gl_journal_batches b join gl_journal_lines l on l.batch_id=b.id join gl_accounts a on a.id=l.account_id where b.id='${paid.id}' and l.credit_lyd>0`)
  assert.deepEqual([entry.journal_date.toISOString().slice(0,10),entry.code,Number(entry.credit_lyd)],['2026-09-03','1040',30])
})

test('bank statement dedupe target accepts repeat rows with blank descriptions', async () => {
  await db.exec("insert into bank_transactions(account_label,posted_at,amount_lyd,description) values('Main','2026-09-01',25,null) on conflict(account_label,posted_at,amount_lyd,description) do nothing")
  await db.exec("insert into bank_transactions(account_label,posted_at,amount_lyd,description) values('Main','2026-09-01',25,null) on conflict(account_label,posted_at,amount_lyd,description) do nothing")
  assert.equal(Number((await rows('select count(*) n from bank_transactions'))[0].n),1)
})
