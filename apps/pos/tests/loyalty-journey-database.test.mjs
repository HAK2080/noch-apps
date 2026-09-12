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
const migration = async name => (await fs.readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
const row = async (sql, args = []) => (await db.query(sql, args)).rows[0]
const rpc = async (sql, args = []) => (await row(`select ${sql} result`, args)).result
const submit = (quantity = 1, lat = 32, lng = 13) => rpc('submit_guest_order($1,$2,$3,$4,$5::jsonb,null,$6,$7,null)',
  [branch, 'Synthetic test only', '0000000000', 'pickup', JSON.stringify([{ product_id: product, quantity, unit_price: 0.01 }]), lat, lng])
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
    create table profiles(id uuid primary key,auth_user_id uuid,role text,is_active boolean default true);
    insert into profiles(id,role) values('${owner}','owner');
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
      awaiting_staff_confirm boolean,pickup_code text,loyalty_customer_id uuid,refunded_amount_lyd numeric default 0,created_at timestamptz default now());
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
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`)
})
after(async () => db.close())

test('guest order uses server price; pending order earns zero; completing earns floor(total) once', () => isolated(async () => {
  const order = await submit()
  assert.equal(order.total, 23.9)
  const saved = await row('select * from pos_orders where id=$1', [order.order_id])
  assert.equal(saved.status, 'pending')
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 0)
  await rpc('confirm_pickup_order($1,$2)', [order.pickup_code, branch])
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 23)
  assert.equal(Number((await row('select qty from location_product_stock')).qty), 9)
  assert.match((await rpc('confirm_pickup_order($1,$2)', [order.pickup_code, branch])).error, /already used/)
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

test('strict stock guard rolls back failed last-item completion including point award', () => isolated(async () => {
  await rpc('set_global_stock_block(true)')
  await db.exec('update location_product_stock set qty=1; update pos_products set stock_qty=1')
  const order = await submit()
  await db.exec('savepoint completion')
  await assert.rejects(rpc('confirm_pickup_order($1,$2)', [order.pickup_code, branch]), /STOCK_BLOCKED/)
  await db.exec('rollback to savepoint completion')
  assert.equal((await row('select status from pos_orders where id=$1', [order.order_id])).status, 'pending')
  assert.equal(Number((await row('select qty from location_product_stock')).qty), 1)
  assert.equal((await row('select count(*)::integer n from loyalty_v2_point_events')).n, 0)
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

test('GAP: repository grants let anonymous caller complete pending pickup without recorded payment', () => isolated(async () => {
  const order = await submit()
  await db.exec('set local role anon')
  const result = await rpc('confirm_pickup_order($1,$2)', [order.pickup_code, branch])
  assert.equal(result.success, true)
  await db.exec('reset role')
  const saved = await row('select status,payment_method from pos_orders where id=$1', [order.order_id])
  assert.equal(saved.status, 'completed')
  assert.equal(saved.payment_method, 'pickup')
}))

test('GAP: strict stock completion plus pickup RPC deducts a tracked item twice', () => isolated(async () => {
  await rpc('set_global_stock_block(true)')
  const order = await submit()
  await rpc('confirm_pickup_order($1,$2)', [order.pickup_code, branch])
  assert.equal(Number((await row('select qty from location_product_stock')).qty), 8)
  assert.equal((await row('select count(*)::integer n from pos_inventory_movements')).n, 2)
}))

test('refund and void adjust base points while preserving unrelated legacy opening value', () => isolated(async () => {
  const order = await submit()
  const saved = await row('select loyalty_customer_id from pos_orders where id=$1', [order.order_id])
  await db.query("insert into loyalty_v2_point_events(customer_id,event_type,points_delta,idempotency_key) values($1,'legacy_opening',100,'legacy-test')", [saved.loyalty_customer_id])
  await rpc('confirm_pickup_order($1,$2)', [order.pickup_code, branch])
  await db.query('update pos_orders set refunded_amount_lyd=0.95 where id=$1', [order.order_id])
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 122)
  await rpc('settle_loyalty_order_v2($1)', [order.order_id])
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 122)
  await db.query("update pos_orders set status='voided' where id=$1", [order.order_id])
  assert.equal(await rpc('loyalty_v2_balance($1)', [saved.loyalty_customer_id]), 100)
}))
