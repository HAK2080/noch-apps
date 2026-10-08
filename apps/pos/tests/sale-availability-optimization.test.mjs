import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = file => readFile(new URL(`../../../supabase/migrations/${file}.sql`, import.meta.url), 'utf8')

test('set-based availability matches the installed policy for branch visibility, beans, missing and depleted stock', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create table pos_products(id uuid primary key,is_active bool,is_sold_out bool,track_inventory bool,
        branch_id uuid,visible_branch_ids uuid[],coffee_bean_product_id uuid,coffee_grams_per_sale numeric);
      create table inventory_locations(id uuid primary key,branch_id uuid,location_type text,is_active bool,created_at timestamptz);
      create table location_product_stock(location_id uuid,product_id uuid,qty numeric,primary key(location_id,product_id));
      create table test_policy(enabled bool); insert into test_policy values(true);
      create function strict_stock_enabled() returns bool language sql stable as $$select enabled from test_policy$$;
      insert into pos_products select md5(i::text)::uuid,i%11<>0,case when i%7=0 then true when i%17=0 then null else false end,
        case when i%3=0 then true when i%19=0 then null else false end,
        case when i%4=0 then null else md5(('branch'||(i%2))::text)::uuid end,
        case when i%5=0 then array[md5('branch0')::uuid] else null end,
        case when i%2=0 then md5((i%7+1)::text)::uuid else null end,
        case i%6 when 0 then 0.0001 when 1 then 0 when 2 then 27.1255 when 3 then -1 when 4 then null else 1 end
        from generate_series(1,160) i;
      insert into inventory_locations values(md5('location0')::uuid,md5('branch0')::uuid,'branch',true,now()-interval '1 day'),
        (md5('location1')::uuid,md5('branch1')::uuid,'branch',true,now()),
        (md5('later')::uuid,md5('branch0')::uuid,'branch',true,now());
      insert into location_product_stock select md5(('location'||b)::text)::uuid,md5(i::text)::uuid,
        case i%5 when 0 then 0 when 1 then 0.5 when 2 then 100 when 3 then -1 else null end
        from generate_series(1,160) i cross join generate_series(0,1) b where i%13<>0;`)
    const original = await migration('20260912110000_global_stock_sales_guard')
    const requirements = original.slice(original.indexOf('create function public.sale_stock_requirements'), original.indexOf('revoke all on function public.sale_stock_requirements'))
    const availability = original.slice(original.indexOf('create function public.get_sale_availability'), original.indexOf('revoke all on function public.get_sale_availability'))
    await db.exec(requirements)
    await db.exec(availability)
    await db.exec(availability.replace('public.get_sale_availability(', 'public.legacy_availability('))
    await db.exec('revoke all on function get_sale_availability(uuid) from public; grant execute on function get_sale_availability(uuid) to anon,authenticated;')
    await db.exec(await migration('20261008050000_sale_availability_set_based'))
    for (const enabled of [false, true]) {
      await db.query('update test_policy set enabled=$1', [enabled])
      for (const branch of ['branch0','branch1','missing',null]) {
        const param = branch ? (await db.query('select md5($1)::uuid as id', [branch])).rows[0].id : null
        const old = (await db.query('select * from legacy_availability($1) order by product_id', [param])).rows
        const optimized = (await db.query('select * from get_sale_availability($1) order by product_id', [param])).rows
        assert.deepEqual(optimized, old, `policy=${enabled}, branch=${branch}`)
      }
    }
    assert.equal((await db.query("select has_function_privilege('anon','get_sale_availability(uuid)','execute') as allowed")).rows[0].allowed, true)
    // Disabled stock policy must not invoke the expensive stock-requirement path.
    await db.exec("update test_policy set enabled=false; drop function sale_stock_requirements(jsonb)")
    assert.ok((await db.query('select * from get_sale_availability(null)')).rows.length > 0)
  } finally { await db.close() }
})

test('index cleanup removes only the identical copy, preserves rows and skips a different index', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table pos_order_items(id int primary key,product_id uuid,quantity numeric);
      insert into pos_order_items values(1,md5('coffee')::uuid,2);
      create index idx_pos_order_items_product_id on pos_order_items(product_id);
      create index idx_pos_order_items_product on pos_order_items(product_id);`)
    const sql = await migration('20261008050100_remove_duplicate_product_index')
    await db.exec(sql)
    await db.exec(sql)
    assert.equal((await db.query("select to_regclass('idx_pos_order_items_product') as idx")).rows[0].idx, null)
    assert.ok((await db.query("select to_regclass('idx_pos_order_items_product_id') as idx")).rows[0].idx)
    assert.equal((await db.query('select quantity from pos_order_items')).rows[0].quantity, '2')
    await db.exec('create index idx_pos_order_items_product on pos_order_items(quantity)')
    await db.exec(sql)
    assert.ok((await db.query("select to_regclass('idx_pos_order_items_product') as idx")).rows[0].idx)
  } finally { await db.close() }
})
