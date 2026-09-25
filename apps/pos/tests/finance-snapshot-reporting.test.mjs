import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migration = await fs.readFile(new URL('../../../supabase/migrations/20260925140000_snapshotted_finance_cogs.sql', import.meta.url), 'utf8')
const matrixStart = migration.indexOf('create or replace function public.finance_menu_matrix(')
const productStart = migration.indexOf('create or replace function public.pos_sales_by_product(')
const grantStart = migration.indexOf('grant execute on function public.pos_sales_by_product(', productStart)
const rows = async (sql) => (await db.query(sql)).rows

before(async () => {
  assert.ok(matrixStart > 0 && productStart > matrixStart && grantStart > productStart)
  await db.exec(`
    create role authenticated;
    create table pos_products(id uuid primary key,cost_lyd numeric);
    create table pos_orders(id uuid primary key,branch_id uuid,status text,created_at timestamptz);
    create table pos_order_items(id uuid primary key,order_id uuid references pos_orders(id),product_id uuid references pos_products(id),product_name text,quantity numeric,total numeric,unit_cost_lyd_at_sale numeric);
    insert into pos_products values('00000000-0000-0000-0000-000000000002',20);
    insert into pos_orders values
      ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','completed','2026-09-24 04:59+02'),
      ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','completed','2026-09-24 05:00+02'),
      ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','completed','2026-09-24 06:00+02');
    insert into pos_order_items values
      ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','Matcha',2,60,10),
      ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','Matcha',1,30,12),
      ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002','Matcha',1,30,null);
  `)
  await db.exec(migration.slice(matrixStart, grantStart))
})

after(async () => db.close())

test('product matrix uses the 05:00 boundary and sale-time cost', async () => {
  const [prior] = await rows("select units_sold,revenue,unit_cost,total_contribution from finance_menu_matrix('00000000-0000-0000-0000-000000000001','2026-09-23','2026-09-23')")
  assert.deepEqual([Number(prior.units_sold),Number(prior.revenue),Number(prior.unit_cost),Number(prior.total_contribution)],[2,60,10,40])
  const [next] = await rows("select units_sold,revenue,unit_cost,total_contribution from finance_menu_matrix('00000000-0000-0000-0000-000000000001','2026-09-24','2026-09-24')")
  assert.deepEqual([Number(next.units_sold),Number(next.revenue),Number(next.unit_cost),Number(next.total_contribution)],[2,60,16,28])
})

test('POS product report uses snapshots with an explicit legacy fallback', async () => {
  const [sold] = await rows("select qty,revenue,cogs,profit from pos_sales_by_product('00000000-0000-0000-0000-000000000001','2026-09-23 05:00+02','2026-09-25 05:00+02')")
  assert.deepEqual([Number(sold.qty),Number(sold.revenue),Number(sold.cogs),Number(sold.profit)],[4,120,52,68])
})
