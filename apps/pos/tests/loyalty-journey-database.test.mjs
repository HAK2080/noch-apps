import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// Entirely in-memory: actual repository RPCs, synthetic schema/data only.
// Reward issuance/mission qualification are explicitly stubbed; these tests
// prove order/stock/base-point behavior, NOT prize redemption or full migrations.
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const branch = id(1), product = id(2), location = id(3), owner = id(4)
const shift = id(5), staff = id(6)
const migration = async name => (await fs.readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
const row = async (sql, args = []) => (await db.query(sql, args)).rows[0]
const rpc = async (sql, args = []) => (await row(`select ${sql} result`, args)).result
const submit = (quantity = 1, lat = 32, lng = 13) => rpc('submit_guest_order($1,$2,$3,$4,$5::jsonb,null,$6,$7,null)',
  [branch, 'Synthetic test only', '0000000000', 'pickup', JSON.stringify([{ product_id: product, quantity, unit_price: 0.01 }]), lat, lng])
const pay = (order, method = 'cash', cash = 30, card = 0, targetBranch = branch, targetShift = shift, expected = order.total) =>
  rpc('complete_online_order_payment($1,$2,$3,$4,$5,$6,$7)', [order.order_id, targetBranch, targetShift, expected, method, cash, card])
async function rejectsSafely(fn, pattern) {
  await db.exec('savepoint rejected')
  await assert.rejects(fn(), pattern)
  await db.exec('rollback to savepoint rejected')
}
async function isolated(fn) {
  await db.exec('begin')
  try { await fn() } finally { await db.exec('rollback') }
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;
    create table profiles(id uuid primary key,auth_user_id uuid,role text,is_active boolean default true,branch_id uuid);
    insert into profiles(id,role) values('${owner}','owner');
    insert into profiles(id,role,branch_id) values('${staff}','staff','${id(99)}');
    create table staff_branches(user_id uuid,branch_id uuid);
    create table pos_branches(id uuid primary key,name text,lat double precision,lng double precision,geofence_radius_m numeric);
    insert into pos_branches values('${branch}','Synthetic branch',32,13,50);
    create table pos_products(id uuid primary key,name text,name_ar text,price numeric,is_active boolean default true,
      visible_on_customer_menu boolean default true,visible_branch_ids uuid[],branch_id uuid,is_sold_out boolean default false,
      track_inventory boolean default true,stock_qty numeric default 10,coffee_bean_product_id uuid,coffee_grams_per_sale numeric,updated_at timestamptz);
    insert into pos_products(id,name,name_ar,price,branch_id) values('${product}','Synthetic Latte','لاتيه تجريبي',23.9,'${branch}');
    create table loyalty_customers(id uuid primary key default gen_random_uuid(),phone text unique,full_name text);
    create sequence online_order_number_seq;
    create table pos_orders(id uuid primary key default gen_random_uuid(),branch_id uuid,order_number text,source text,is_guest boolean,status text,
      customer_name text,customer_phone text,payment_method text,table_number text,subtotal numeric,discount_amount numeric,total numeric,discount_pct numeric,
      awaiting_staff_confirm boolean,pickup_code text,loyalty_customer_id uuid,refunded_amount_lyd numeric default 0,created_at timestamptz default now(),
      shift_id uuid,served_by uuid,card_amount numeric,cash_tendered numeric,change_due numeric,voided_at timestamptz);
    create table pos_shifts(id uuid primary key,branch_id uuid,status text,total_sales numeric default 0,total_orders integer default 0,
      total_cash_sales numeric default 0,total_card_sales numeric default 0,total_discounts numeric default 0,expected_cash numeric default 100);
    insert into pos_shifts(id,branch_id,status) values('${shift}','${branch}','open');
    create table pos_shift_attendees(shift_id uuid,user_id uuid,total_sales numeric default 0,total_orders integer default 0);
    insert into pos_shift_attendees(shift_id,user_id) values('${shift}','${owner}');
    create table pos_tender_events(id uuid primary key default gen_random_uuid(),branch_id uuid,shift_id uuid,order_id uuid,event_type text,tender_type text,
      signed_amount_lyd numeric,occurred_at timestamptz,source_quality text,source_ref text unique,actor_user_id uuid,served_by uuid,metadata jsonb);
    create table pos_order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,product_name text,product_name_ar text,
      unit_price numeric,quantity numeric,total numeric,refunded_qty numeric default 0);
    create table pos_coupons(code text,used_count integer);
    create function apply_coupon(text,uuid,numeric) returns jsonb language sql as $$select '{"valid":false,"message":"test fixture"}'::jsonb$$;
    create table inventory_locations(id uuid primary key,branch_id uuid,location_type text,is_active boolean,created_at timestamptz default now());
    insert into inventory_locations values('${location}','${branch}','branch',true,now());
    create table location_product_stock(location_id uuid,product_id uuid,qty numeric,updated_at timestamptz,primary key(location_id,product_id));
    insert into location_product_stock values('${location}','${product}',10,now());
    create table pos_inventory_movements(id uuid primary key default gen_random_uuid(),branch_id uuid,product_id uuid,movement_type text,quantity numeric,
      stock_before numeric,stock_after numeric,reference_id uuid,actor_profile_id uuid,notes text);
    create table location_product_movements(id uuid default gen_random_uuid(),location_id uuid,product_id uuid,movement_type text,quantity numeric,
      stock_before numeric,stock_after numeric,actor_profile_id uuid,notes text,source text,source_ref text);
    create unique index on location_product_movements(source,source_ref) where source_ref is not null;
    create function sync_product_branch_stock_total(uuid) returns void language sql as $$
      update pos_products set stock_qty=(select sum(qty) from location_product_stock where product_id=$1) where id=$1$$;
    create function create_pos_order_test(v_item jsonb) returns boolean language sql as $$select coalesce((v_item->>'track_inventory')::boolean, false)$$;
    create table loyalty_v2_memberships(customer_id uuid primary key,loyalty_number text);
    create table loyalty_v2_settings(program_code text,points_per_lyd numeric);
    insert into loyalty_v2_settings values('v2',1);
    create table loyalty_v2_point_events(customer_id uuid,event_type text,points_delta integer,order_id uuid,mission_id uuid,idempotency_key text unique,metadata jsonb);
    create table loyalty_v2_missions(id uuid primary key,status text,starts_at timestamptz,ends_at timestamptz,created_at timestamptz,
      target_count integer,max_completions integer,reward_points integer,code text);
    create table loyalty_v2_mission_progress(id uuid primary key default gen_random_uuid(),mission_id uuid,customer_id uuid,progress_count integer,
      completions integer default 0,status text,last_qualified_at timestamptz,completed_at timestamptz,updated_at timestamptz,unique(mission_id,customer_id));
    create table loyalty_v2_mission_order_events(id uuid primary key default gen_random_uuid(),mission_id uuid,customer_id uuid,order_id uuid,
      reversed_at timestamptz,completion_awarded boolean default false,unique(mission_id,customer_id,order_id));
    create function loyalty_mission_order_qualifies_v2(uuid,uuid) returns boolean language sql as $$select false$$;
    create function rebalance_loyalty_rewards_v2(uuid) returns void language sql as $$select$$;
    create function issue_loyalty_rewards_v2(uuid) returns integer language sql as $$select 0$$;
    create function loyalty_v2_balance(uuid) returns integer language sql as $$select coalesce(sum(points_delta),0)::integer from loyalty_v2_point_events where customer_id=$1$$;
  `)
  await db.exec(await migration('20260718190200_guest_order_followups'))
  const inventory = await migration('20260731203000_inventory_control_authority')
  await db.exec(inventory.slice(inventory.indexOf('create or replace function public.mirror_pos_movement_to_location_stock()'), inventory.indexOf('-- Safe rollback evidence.')))
  const loyalty = await migration('20260730180000_loyalty_v2')
  await db.exec(loyalty.slice(loyalty.indexOf('create or replace function public.settle_loyalty_order_v2('), loyalty.indexOf('create or replace function public.redeem_loyalty_reward_v2(')))
  await db.exec(await migration('20260912110000_global_stock_sales_guard'))
  const tender = await migration('20260731170000_sales_cash_control')
  await db.exec(tender.slice(tender.indexOf('create or replace function public.pos_record_tender_legs('), tender.indexOf('revoke all on function public.pos_record_tender_legs(')))
  await db.exec(tender.slice(tender.indexOf('create or replace function public.pos_capture_order_tender_events()'), tender.indexOf('create or replace function public.refund_pos_order_lines_v2(')))
  await db.exec(await migration('20260912170000_online_order_payment_safety'))
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`)
})
after(async () => db.close())

test('guest order uses server price; pending order earns zero; completing earns floor(total) once', () => isolated(async () => {
  const order = await submit()
  assert.equal(order.total, 23.9)
  const saved = await row('select * from pos_orders where id=$1', [order.order_id])
  assert.equal(saved.status, 'pending')
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 0)
  await pay(order)
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 23)
  assert.equal(Number((await row('select qty from location_product_stock')).qty), 9)
  assert.equal((await pay(order)).already_completed, true)
  await rpc('settle_loyalty_order_v2($1)', [order.order_id])
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 23)
  assert.equal(Number((await row('select qty from location_product_stock')).qty), 9)
}))

test('invalid quantity rolls back whole guest order; outside coordinates rejected', () => isolated(async () => {
  await db.exec('savepoint invalid_quantity')
  await assert.rejects(submit(51), /Invalid quantity/)
  await db.exec('rollback to savepoint invalid_quantity')
  assert.equal((await row('select count(*)::integer n from pos_orders')).n, 0)
  assert.equal((await submit(1, 40, 13)).error, 'on_site_required')
}))

test('strict stock permits the last item exactly once', () => isolated(async () => {
  await rpc('set_global_stock_block(true)')
  await db.exec('update location_product_stock set qty=1; update pos_products set stock_qty=1')
  const order = await submit()
  await pay(order)
  assert.equal((await row('select status from pos_orders where id=$1', [order.order_id])).status, 'completed')
  assert.equal(Number((await row('select qty from location_product_stock')).qty), 0)
  assert.equal((await row('select count(*)::integer n from loyalty_v2_point_events')).n, 1)
}))

test('GAP: missing coordinates bypass guest RPC location check', () => isolated(async () => {
  const result = await submit(1, null, null)
  assert.equal(result.success, true)
}))

test('GAP: repeated guest submissions create distinct orders (no idempotency token)', () => isolated(async () => {
  const first = await submit(), second = await submit()
  assert.notEqual(first.order_id, second.order_id)
  assert.equal((await row('select count(*)::integer n from pos_orders')).n, 2)
}))

test('anonymous callers cannot complete, accept, cancel or record payment', () => isolated(async () => {
  const order = await submit()
  await db.exec('set local role anon')
  await rejectsSafely(() => rpc('confirm_pickup_order($1,$2)', [order.pickup_code, branch]), /permission denied/)
  await rejectsSafely(() => rpc('approve_online_order($1,$2)', [order.order_id, branch]), /permission denied/)
  await rejectsSafely(() => rpc('cancel_online_order($1,$2)', [order.order_id, branch]), /permission denied/)
  await rejectsSafely(() => pay(order), /permission denied/)
  await db.exec('reset role')
  const saved = await row('select status,payment_method from pos_orders where id=$1', [order.order_id])
  assert.equal(saved.status, 'pending')
  assert.equal(saved.payment_method, 'pickup')
}))

test('strict stock completion deducts tracked stock once; payment/tender/shift/points replay safely', () => isolated(async () => {
  await rpc('set_global_stock_block(true)')
  const order = await submit()
  await pay(order)
  await pay(order)
  assert.equal(Number((await row('select qty from location_product_stock')).qty), 9)
  assert.equal((await row('select count(*)::integer n from pos_inventory_movements')).n, 1)
  assert.equal((await row('select count(*)::integer n from pos_online_payments')).n, 1)
  const tender = await row('select event_type,tender_type,signed_amount_lyd from pos_tender_events')
  assert.deepEqual(tender, { event_type: 'sale', tender_type: 'cash', signed_amount_lyd: '23.900' })
  assert.equal((await row('select count(*)::integer n from pos_tender_events')).n, 1)
  assert.equal((await row('select total_orders from pos_shifts')).total_orders, 1)
  assert.equal(Number((await row('select expected_cash from pos_shifts')).expected_cash), 123.9)
}))

test('wrong branch, inactive and non-POS users cannot pay or cancel', () => isolated(async () => {
  const order = await submit()
  await db.exec(`select set_config('request.jwt.claim.sub','${staff}',true)`)
  await rejectsSafely(() => pay(order), /branch access/)
  await rejectsSafely(() => rpc('cancel_online_order($1,$2)', [order.order_id,branch]), /branch access/)
  await db.exec(`insert into staff_branches values('${staff}','${branch}'); update profiles set is_active=false where id='${staff}'`)
  await rejectsSafely(() => pay(order), /staff sign-in/)
  await db.exec(`update profiles set is_active=true,role='accountant' where id='${staff}'`)
  await rejectsSafely(() => pay(order), /staff sign-in/)
  await db.exec(`update profiles set role='staff' where id='${staff}'`)
  assert.equal((await pay(order)).success, true)
}))

test('closed/wrong shift, changed total, insufficient/invalid cash and invalid split fail without effects', () => isolated(async () => {
  const order = await submit()
  await rejectsSafely(() => pay(order,'cash',20), /below/)
  await rejectsSafely(() => pay(order,'cash','NaN'), /below/)
  await rejectsSafely(() => pay(order,'split',30,24), /card amount/)
  await rejectsSafely(() => pay(order,'split',30,0), /card amount/)
  await rejectsSafely(() => pay(order,'pickup',30), /Choose/)
  await rejectsSafely(() => pay(order,'cash',30,0,branch,shift,1), /total changed/)
  await rejectsSafely(() => pay(order,'cash',30,0,branch,id(99)), /open shift/)
  await db.exec("update pos_shifts set status='closed'")
  await rejectsSafely(() => pay(order), /open shift/)
  for (const table of ['pos_online_payments','pos_tender_events','pos_inventory_movements','loyalty_v2_point_events']) {
    assert.equal((await row(`select count(*)::integer n from ${table}`)).n,0)
  }
}))

test('stock lost before payment rolls back payment proof, order, tender, loyalty and shift counters', () => isolated(async () => {
  await rpc('set_global_stock_block(true)')
  const order = await submit()
  await db.exec('update location_product_stock set qty=0; update pos_products set stock_qty=0')
  await rejectsSafely(() => pay(order), /STOCK_BLOCKED/)
  for (const table of ['pos_online_payments','pos_tender_events','pos_inventory_movements','loyalty_v2_point_events']) {
    assert.equal((await row(`select count(*)::integer n from ${table}`)).n,0)
  }
  assert.equal((await row('select status from pos_orders')).status,'pending')
  assert.equal((await row('select total_orders from pos_shifts')).total_orders,0)
}))

test('legacy accept/collect and direct completed-state edits cannot skip payment', () => isolated(async () => {
  const order = await submit()
  await rejectsSafely(() => rpc('approve_online_order($1,$2)', [order.order_id,branch]), /payment required/)
  await rejectsSafely(() => rpc('confirm_pickup_order($1,$2)', [order.pickup_code,branch]), /payment required/)
  await rejectsSafely(() => db.query("update pos_orders set status='completed' where id=$1",[order.order_id]), /payment required/)
  await rejectsSafely(() => db.query("update pos_orders set status='completed',source='pos' where id=$1",[order.order_id]), /source cannot change/)
  assert.equal((await row('select count(*)::integer n from pos_inventory_movements')).n,0)
}))

test('stock-policy off with no location preserves legacy tracked aggregate deduction', () => isolated(async () => {
  await db.exec('delete from inventory_locations')
  const order = await submit()
  await pay(order)
  assert.equal(Number((await row('select stock_qty from pos_products')).stock_qty),9)
}))

test('already preparing legacy order is paid without asking for another preparation ticket', () => isolated(async () => {
  const order = await submit()
  await db.query("update pos_orders set status='in_progress',awaiting_staff_confirm=false where id=$1",[order.order_id])
  assert.equal((await pay(order)).print_ticket,false)
}))

test('unpaid cancellation is idempotent; paid cancellation and post-void replay require refund workflow', () => isolated(async () => {
  const cancelled = await submit()
  await rpc('cancel_online_order($1,$2)',[cancelled.order_id,branch])
  assert.equal((await rpc('cancel_online_order($1,$2)',[cancelled.order_id,branch])).already_cancelled,true)
  await rejectsSafely(() => pay(cancelled), /no longer/)
  const paid = await submit()
  await pay(paid)
  await rejectsSafely(() => rpc('cancel_online_order($1,$2)',[paid.order_id,branch]), /refund workflow/)
  await db.query("update pos_orders set status='voided' where id=$1",[paid.order_id])
  await rejectsSafely(() => pay(paid), /refund workflow/)
  assert.equal((await row('select count(*)::integer n from pos_online_payments')).n,1)
}))

for (const method of ['card','split']) test(`${method} records exact tender legs, change and shift totals once`, () => isolated(async () => {
  const order = await submit()
  await pay(order,method,20,10)
  await pay(order,method,20,10)
  const tender = (await db.query('select tender_type,signed_amount_lyd from pos_tender_events order by tender_type')).rows
  assert.equal(tender.length,method==='card'?1:2)
  assert.equal(Number((await row('select sum(signed_amount_lyd) total from pos_tender_events')).total),23.9)
  assert.equal(Number((await row('select change_due from pos_online_payments')).change_due),method==='card'?0:6.1)
  assert.equal(Number((await row('select expected_cash from pos_shifts')).expected_cash),method==='card'?100:113.9)
}))

test('existing completed-sale corrections remain balanced and do not add stock or points', () => isolated(async () => {
  const order = await submit()
  await pay(order)
  await db.query("update pos_orders set payment_method='card',card_amount=total where id=$1",[order.order_id])
  assert.equal((await row('select count(*)::integer n from pos_tender_events')).n,3)
  assert.equal(Number((await row('select sum(signed_amount_lyd) total from pos_tender_events')).total),23.9)
  assert.equal((await row('select count(*)::integer n from pos_inventory_movements')).n,1)
  assert.equal((await row('select count(*)::integer n from loyalty_v2_point_events')).n,1)
}))

test('refund and void adjust base points while preserving unrelated legacy opening value', () => isolated(async () => {
  const order = await submit()
  const saved = await row('select loyalty_customer_id from pos_orders where id=$1', [order.order_id])
  await db.query("insert into loyalty_v2_point_events(customer_id,event_type,points_delta,idempotency_key) values($1,'legacy_opening',100,'legacy-test')", [saved.loyalty_customer_id])
  await pay(order)
  await db.query('update pos_orders set refunded_amount_lyd=0.95 where id=$1', [order.order_id])
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 122)
  await rpc('settle_loyalty_order_v2($1)', [order.order_id])
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 122)
  await db.query("update pos_orders set status='voided' where id=$1", [order.order_id])
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 100)
}))
