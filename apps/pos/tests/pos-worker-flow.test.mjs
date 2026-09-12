import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const source = await fs.readFile(new URL('../src/modules/pos/pages/POSTerminal.jsx',import.meta.url),'utf8')
const start=source.indexOf('async (product, opts = {}) => {',source.indexOf('const addToCart'))
const end=source.indexOf('}, [settings, addCartLine',start)+1
function handler(cached,fetcher) {
  const calls={added:[],options:[],errors:[]}
  const fn=vm.runInNewContext('('+source.slice(start,end)+')',{
    modifierData:cached,settings:{},products:[],getModifierGroupsForProduct:fetcher,
    withPOSNetworkTimeout:p=>p,addCartLine:p=>calls.added.push(p),setModifierProduct:p=>calls.options.push(p),
    toast:{error:e=>calls.errors.push(e)},cashierError:(_e,fallback)=>fallback,msg:s=>s,
  })
  return {fn,calls}
}
test('cached option-free taps add immediately without a request; cached options open the chooser',async()=>{
  let requests=0
  const plain=handler({groupsForProduct:()=>[]},()=>{requests++;throw Error('offline')})
  await plain.fn({id:'water'})
  assert.equal(plain.calls.added.length,1);assert.equal(requests,0)
  const groups=[{id:'milk',is_required:true}]
  const option=handler({groupsForProduct:()=>groups},()=>{requests++})
  await option.fn({id:'latte'})
  assert.equal(option.calls.options[0].groups,groups);assert.equal(option.calls.added.length,0);assert.equal(requests,0)
})
test('unknown options use bounded lookup; failed lookup never silently sells without required options',async()=>{
  const groups=[{id:'milk'}]
  const success=handler(null,async()=>groups);await success.fn({id:'latte'})
  assert.equal(success.calls.options[0].groups,groups)
  const fail=handler(null,async()=>{throw Error('offline')});await fail.fn({id:'latte'})
  assert.equal(fail.calls.added.length,0);assert.equal(fail.calls.errors[0],'Failed to load options')
})
test('popularity counts completed branch sales net of refunds, excluding pending, cancelled and old orders',async()=>{
  const db=new PGlite()
  try {
    await db.exec(`create table pos_orders(id int,branch_id uuid,created_at timestamptz,status text,voided_at timestamptz);
      create table pos_order_items(order_id int,product_id uuid,quantity int,refunded_qty int);
      insert into pos_orders values
      (1,'00000000-0000-0000-0000-000000000001',now(),'completed',null),
      (2,'00000000-0000-0000-0000-000000000001',now(),'pending',null),
      (3,'00000000-0000-0000-0000-000000000001',now(),'cancelled',null),
      (4,'00000000-0000-0000-0000-000000000002',now(),'completed',null),
      (5,'00000000-0000-0000-0000-000000000001',now()-interval '31 days','completed',null);
      insert into pos_order_items select id,'00000000-0000-0000-0000-000000000010',case when id=1 then 5 else 100 end,case when id=1 then 2 else 0 end from pos_orders;`)
    await db.exec(await fs.readFile(new URL('../../../supabase/migrations/20260912160000_pos_popularity_completed_sales.sql',import.meta.url),'utf8'))
    const rows=(await db.query("select * from get_product_popularity('00000000-0000-0000-0000-000000000001')")).rows
    assert.equal(Number(rows[0].units_sold),3)
    assert.equal(Number((await db.query('select * from get_product_popularity(null)')).rows[0].units_sold),103)
  } finally {await db.close()}
})
