import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const migration = async name => (await fs.readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
const first = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const owner = id(1), staff = id(2), branch = id(3), location = id(4), cake = id(5), coffee = id(6), bean = id(7), unknown = id(8)

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    create table profiles(id uuid primary key,auth_user_id uuid,role text,is_employee boolean default false,payroll_enabled boolean default false,
      monthly_salary numeric,monthly_salary_lyd numeric,start_date date,employment_end_date date,is_active boolean default true);
    insert into profiles(id,role) values('${owner}','owner'),('${staff}','staff');
    create table pos_products(id uuid primary key,name text,is_active boolean default true,is_sold_out boolean default false,
      track_inventory boolean default false,stock_qty numeric default 0,coffee_bean_product_id uuid,coffee_grams_per_sale numeric,
      branch_id uuid,visible_branch_ids uuid[],updated_at timestamptz);
    insert into pos_products(id,name,track_inventory,coffee_bean_product_id,coffee_grams_per_sale,branch_id) values
      ('${cake}','Cake',true,null,null,'${branch}'),('${coffee}','Coffee',false,'${bean}',27,'${branch}'),
      ('${bean}','Beans',false,null,null,'${branch}'),('${unknown}','No setup',false,null,null,'${branch}');
    create table inventory_locations(id uuid primary key,branch_id uuid,location_type text,is_active boolean default true,created_at timestamptz default now());
    insert into inventory_locations values('${location}','${branch}','branch',true,now());
    create table location_product_stock(location_id uuid,product_id uuid,qty numeric,updated_at timestamptz,primary key(location_id,product_id));
    insert into location_product_stock values('${location}','${cake}',5,now()),('${location}','${bean}',54,now());
    create table pos_orders(id uuid primary key default gen_random_uuid(),branch_id uuid,status text,order_number text);
    create table pos_order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,quantity numeric,refunded_qty numeric default 0);
    create table pos_inventory_movements(id uuid default gen_random_uuid(),branch_id uuid,product_id uuid,movement_type text,
      quantity numeric,stock_before numeric,stock_after numeric,reference_id uuid,actor_profile_id uuid,notes text);
    create table location_product_movements(id uuid default gen_random_uuid(),location_id uuid,product_id uuid,movement_type text,
      quantity numeric,stock_before numeric,stock_after numeric,order_id uuid,order_item_id uuid,actor_profile_id uuid,notes text,source text,source_ref text);
    create unique index on location_product_movements(source,source_ref) where source_ref is not null;
    create function sync_product_branch_stock_total(uuid) returns void language sql as $$
      update pos_products set stock_qty=(select sum(qty) from location_product_stock where product_id=$1) where id=$1 $$;
    create function create_pos_order_test(v_item jsonb) returns boolean language sql as $$select coalesce((v_item->>'track_inventory')::boolean, false)$$;
    create table expenses(id uuid primary key default gen_random_uuid(),amount numeric,amount_lyd numeric,exchange_rate_to_lyd numeric default 1,
      status text,paid_at date,expense_date date,payment_account_key text,payment_journal_batch_id uuid);
    create table pos_tender_events(id uuid primary key default gen_random_uuid(),tender_type text,signed_amount_lyd numeric,occurred_at timestamptz,source_quality text default 'recorded');
    create table gl_accounts(id uuid primary key,key text);
    insert into gl_accounts values('${id(10)}','cash'),('${id(11)}','bank');
    create function gl_acct(text) returns uuid language sql as $$select id from gl_accounts where key=$1$$;
    create table gl_journal_batches(id uuid primary key default gen_random_uuid(),journal_date date,source_type text,source_ref text,status text);
    create table gl_journal_lines(batch_id uuid,account_id uuid,debit_lyd numeric default 0,credit_lyd numeric default 0);
    create table payroll_runs(id uuid primary key default gen_random_uuid(),period_month date,status text);
    create table payroll_run_items(run_id uuid,net_lyd numeric);
  `)
  // Use the actual existing consumption functions, not JavaScript replicas.
  const authority = await migration('20260731203000_inventory_control_authority')
  await db.exec(authority.slice(authority.indexOf('create or replace function public.mirror_pos_movement_to_location_stock()'), authority.indexOf('-- Safe rollback evidence.')))
  const beans = await migration('20260721180000_coffee_bean_consumption')
  await db.exec(beans.slice(beans.indexOf('create or replace function public.adjust_order_item_coffee_stock('), beans.indexOf('--', beans.indexOf('create trigger pos_orders_adjust_coffee_status')) > 0 ? beans.indexOf('--', beans.indexOf('create trigger pos_orders_adjust_coffee_status')) : undefined))
  await db.exec(await migration('20260912100000_ceo_money_overview'))
  await db.exec(await migration('20260912110000_global_stock_sales_guard'))
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`)
})
after(async () => db.close())

test('only owners can change stock policy or view/save CEO money', async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${staff}',false)`)
  await assert.rejects(db.query('select set_global_stock_block(true)'), /Owner access required/)
  await assert.rejects(db.query("select ceo_money_overview('2026-09-01','2026-09-12')"), /Owner access required/)
  await assert.rejects(db.query("select save_ceo_balances('2026-09-01',10,20)"), /Owner access required/)
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`)
})

test('default off; when on, unknown, zero, negative, insufficient and missing branch stock are blocked', async () => {
  assert.equal((await first('select block_unavailable_stock from pos_global_settings')).block_unavailable_stock, false)
  await db.query('select set_global_stock_block(true)')
  for (const [product, quantity, error] of [[unknown,1,/Set up stock/],[cake,6,/Insufficient/],[coffee,3,/Insufficient/],[cake,0,/Invalid/]]) {
    await assert.rejects(db.query('select assert_sale_stock($1,$2)', [branch, JSON.stringify([{product_id:product,quantity}])]), error)
  }
  await assert.rejects(db.query('select assert_sale_stock($1,$2)', [id(99), JSON.stringify([{product_id:cake,quantity:1}])]), /branch stock/)
  for (const qty of [0,-1]) {
    await db.query('update location_product_stock set qty=$1 where product_id=$2',[qty,cake])
    assert.equal((await first('select blocked from get_sale_availability($1) where product_id=$2',[branch,cake])).blocked,true)
  }
  await db.query('update location_product_stock set qty=5 where product_id=$1',[cake])
})

test('shared bean needs aggregate and forged client inventory flag uses database product setting', async () => {
  await assert.rejects(db.query('select assert_sale_stock($1,$2)',[branch,JSON.stringify([{product_id:coffee,quantity:2},{product_id:coffee,quantity:1}])]), /Insufficient/)
  assert.equal((await first('select create_pos_order_test($1) value',[JSON.stringify({product_id:cake,track_inventory:false})])).value,true)
})

test('completed coffee sales consume once, reject overselling and refund after toggle off', async () => {
  const order = (await first("insert into pos_orders(branch_id,status) values($1,'completed') returning id",[branch])).id
  const item = (await first('insert into pos_order_items(order_id,product_id,quantity) values($1,$2,2) returning id',[order,coffee])).id
  assert.equal(Number((await first('select qty from location_product_stock where product_id=$1',[bean])).qty),0)
  await assert.rejects(db.query('insert into pos_order_items(order_id,product_id,quantity) values($1,$2,1)',[order,coffee]),/Insufficient/)
  await db.query('select set_global_stock_block(false)')
  await db.query('update pos_order_items set refunded_qty=1 where id=$1',[item])
  assert.equal(Number((await first('select qty from location_product_stock where product_id=$1',[bean])).qty),27)
  await db.query('select set_global_stock_block(true)')
})

test('pending online basket quantities recheck and tracked goods consume at completion', async () => {
  const order = (await first("insert into pos_orders(branch_id,status) values($1,'pending') returning id",[branch])).id
  await db.query('insert into pos_order_items(order_id,product_id,quantity) values($1,$2,4)',[order,cake])
  await assert.rejects(db.query('insert into pos_order_items(order_id,product_id,quantity) values($1,$2,2)',[order,cake]),/Insufficient/)
  await db.query('update location_product_stock set qty=3 where product_id=$1',[cake])
  await assert.rejects(db.query("update pos_orders set status='completed' where id=$1",[order]),/Insufficient/)
  await db.query('update location_product_stock set qty=5 where product_id=$1',[cake])
  await db.query("update pos_orders set status='completed' where id=$1",[order])
  assert.equal(Number((await first('select qty from location_product_stock where product_id=$1',[cake])).qty),1)
})

test('ledger sale guard rolls back negative consumption but permits physical corrections', async () => {
  const sql = "insert into location_product_movements(movement_type,quantity,stock_after) values($1,-2,-1)"
  await assert.rejects(db.query(sql,['sale']),/STOCK_BLOCKED/)
  await db.query(sql,['count_correction'])
})

test('cash flow uses Libya dates, excludes unpaid/card and duplicate GL, nets internal transfers', async () => {
  await db.exec(`
    insert into pos_tender_events(tender_type,signed_amount_lyd,occurred_at) values
      ('cash',100,'2026-08-31 22:00Z'),('cash',999,'2026-08-31 21:59Z'),('cash',-10,'2026-09-01 09:00Z'),('card',300,'2026-09-01 09:00Z');
    insert into expenses(id,amount_lyd,status,expense_date,paid_at,payment_account_key,payment_journal_batch_id) values
      ('${id(30)}',20,'paid','2026-08-31','2026-09-01','cash','${id(31)}'),
      ('${id(32)}',50,'approved','2026-09-01',null,null,null),('${id(33)}',70,'rejected','2026-09-01',null,null,null);
    insert into gl_journal_batches values('${id(31)}','2026-09-01','expense','expenses:${id(30)}','posted'),
      ('${id(34)}','2026-09-01','sales_daily','day','posted'),('${id(35)}','2026-09-01','cash','transfer','posted'),
      ('${id(36)}','2026-09-01','cash','card-settlement','posted');
    insert into gl_journal_lines values('${id(31)}','${id(10)}',0,20),('${id(34)}','${id(10)}',100,0),
      ('${id(35)}','${id(10)}',0,15),('${id(35)}','${id(11)}',15,0),('${id(36)}','${id(11)}',200,0);
  `)
  const result = (await first("select ceo_money_overview('2026-09-01','2026-09-01') value")).value
  assert.equal(result.money_in,300)
  assert.equal(result.money_out,30)
  assert.equal(result.balance,270)
  assert.equal(result.invoice_total,50)
  assert.equal(result.observation,null)
})

test('balance observations establish a baseline, expose signed differences and preserve edits', async () => {
  await db.query("select save_ceo_balances('2026-08-31',1000,2000)")
  await db.query("select save_ceo_balances('2026-09-01',1050,2215)")
  let result = (await first("select ceo_money_overview('2026-09-01','2026-09-01') value")).value
  assert.equal(result.expected_cash,1055)
  assert.equal(result.cash_difference,-5)
  assert.equal(result.bank_difference,0)
  await db.query("select save_ceo_balances('2026-09-01',1055,2215)")
  result = (await first("select ceo_money_overview('2026-09-01','2026-09-01') value")).value
  assert.equal(result.cash_difference,0)
  assert.equal(Number((await first('select count(*) n from finance_balance_observations')).n),3)
})

test('payroll estimates prorate monthly drafts without counting them as cash out', async () => {
  await db.exec(`insert into payroll_runs values('${id(40)}','2026-09-01','draft'); insert into payroll_run_items values('${id(40)}',3000)`)
  const result = (await first("select ceo_money_overview('2026-09-01','2026-09-10') value")).value
  assert.equal(result.payroll_estimate,1000)
  assert.equal(result.money_out,30)
  await assert.rejects(db.query("select ceo_money_overview('2026-09-10','2026-09-01')"),/valid date/)
})
