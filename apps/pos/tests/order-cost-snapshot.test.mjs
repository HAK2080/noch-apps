import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migration = await fs.readFile(new URL('../../../supabase/migrations/20260925130000_order_cost_at_sale.sql', import.meta.url), 'utf8')
const branchId = '00000000-0000-0000-0000-000000000001'
const productId = '00000000-0000-0000-0000-000000000002'
const modifierId = '00000000-0000-0000-0000-000000000006'
const directOrderId = '00000000-0000-0000-0000-000000000003'
const pendingOrderId = '00000000-0000-0000-0000-000000000004'
const historicalOrderId = '00000000-0000-0000-0000-000000000005'
const rows = async (sql) => (await db.query(sql)).rows

before(async () => {
  await db.exec(`
    create table public.pos_products(id uuid primary key,cost_lyd numeric(14,3));
    create table public.pos_modifiers(id uuid primary key,cost_delta_lyd numeric(14,3));
    create table public.pos_orders(id uuid primary key,branch_id uuid,status text);
    create table public.pos_order_items(id uuid primary key default gen_random_uuid(),order_id uuid references pos_orders(id),product_id uuid references pos_products(id),quantity numeric,notes text);
    create table public.pos_order_item_modifiers(id uuid primary key default gen_random_uuid(),order_item_id uuid references pos_order_items(id),modifier_id uuid references pos_modifiers(id));
    insert into public.pos_products values('${productId}',10);
    insert into public.pos_modifiers values('${modifierId}',2);
    insert into public.pos_orders values('${historicalOrderId}','${branchId}','completed');
    insert into public.pos_order_items(order_id,product_id,quantity) values('${historicalOrderId}','${productId}',1);
    insert into public.pos_order_item_modifiers(order_item_id,modifier_id)
      select id,'${modifierId}' from public.pos_order_items where order_id='${historicalOrderId}';
  `)
  await db.exec(migration)
})

after(async () => db.close())

test('existing completed items are not backfilled with a guessed cost', async () => {
  const [item] = await rows(`select unit_cost_lyd_at_sale,cost_snapshot_at from pos_order_items where order_id='${historicalOrderId}'`)
  assert.equal(item.unit_cost_lyd_at_sale,null)
  assert.equal(item.cost_snapshot_at,null)
  const [modifier] = await rows(`select cost_delta_lyd_at_sale,cost_snapshot_at from pos_order_item_modifiers where order_item_id in (select id from pos_order_items where order_id='${historicalOrderId}')`)
  assert.equal(modifier.cost_delta_lyd_at_sale,null)
  assert.equal(modifier.cost_snapshot_at,null)
})

test('direct POS sale records an immutable cost even after product cost changes', async () => {
  await db.exec(`
    insert into pos_orders values('${directOrderId}','${branchId}','completed');
    insert into pos_order_items(order_id,product_id,quantity) values('${directOrderId}','${productId}',2);
    insert into pos_order_item_modifiers(order_item_id,modifier_id)
      select id,'${modifierId}' from pos_order_items where order_id='${directOrderId}';
    update pos_products set cost_lyd=12 where id='${productId}';
    update pos_modifiers set cost_delta_lyd=3 where id='${modifierId}';
  `)
  const [item] = await rows(`select unit_cost_lyd_at_sale,cost_snapshot_at from pos_order_items where order_id='${directOrderId}'`)
  assert.equal(Number(item.unit_cost_lyd_at_sale),10)
  assert.ok(item.cost_snapshot_at)
  const [modifier] = await rows(`select cost_delta_lyd_at_sale from pos_order_item_modifiers where order_item_id in (select id from pos_order_items where order_id='${directOrderId}')`)
  assert.equal(Number(modifier.cost_delta_lyd_at_sale),2)
  await assert.rejects(db.exec(`update pos_order_items set unit_cost_lyd_at_sale=99 where order_id='${directOrderId}'`), /paid order cost snapshot cannot be changed/)
  await assert.rejects(db.exec(`update pos_order_item_modifiers set cost_delta_lyd_at_sale=99 where order_item_id in (select id from pos_order_items where order_id='${directOrderId}')`), /paid order modifier cost snapshot cannot be changed/)
  await db.exec(`update pos_order_items set notes='corrected note' where order_id='${directOrderId}'`)
})

test('pending customer order captures cost at first payment, not menu submission', async () => {
  await db.exec(`
    insert into pos_orders values('${pendingOrderId}','${branchId}','pending');
    insert into pos_order_items(order_id,product_id,quantity) values('${pendingOrderId}','${productId}',1);
    insert into pos_order_item_modifiers(order_item_id,modifier_id)
      select id,'${modifierId}' from pos_order_items where order_id='${pendingOrderId}';
    update pos_products set cost_lyd=15 where id='${productId}';
    update pos_modifiers set cost_delta_lyd=4 where id='${modifierId}';
    update pos_orders set status='completed' where id='${pendingOrderId}';
  `)
  const [item] = await rows(`select unit_cost_lyd_at_sale,cost_snapshot_at from pos_order_items where order_id='${pendingOrderId}'`)
  assert.equal(Number(item.unit_cost_lyd_at_sale),15)
  assert.ok(item.cost_snapshot_at)
  const [modifier] = await rows(`select cost_delta_lyd_at_sale,cost_snapshot_at from pos_order_item_modifiers where order_item_id in (select id from pos_order_items where order_id='${pendingOrderId}')`)
  assert.equal(Number(modifier.cost_delta_lyd_at_sale),4)
  assert.ok(modifier.cost_snapshot_at)
  await assert.rejects(db.exec(`update pos_order_items set cost_snapshot_at=now() + interval '1 day' where order_id='${pendingOrderId}'`), /paid order cost snapshot cannot be changed/)
})
