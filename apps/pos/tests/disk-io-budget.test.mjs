import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = name => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8')

test('idle cron guard avoids HTTP work and preserves due delivery, credentials and cadence', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create schema cron;
      create table cron.job(jobid bigint primary key, jobname text, schedule text, command text, active bool);
      create function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null, username text default null, active bool default null) returns void language sql as $$
        update cron.job set command=coalesce($3,cron.job.command), active=coalesce($6,cron.job.active) where jobid=$1 $$;
      create table notification_outbox(status text, scheduled_for timestamptz);
      create table worker_calls(id int);
      insert into cron.job values (1,'vestaboard-feed-every-10-min','*/10 * * * *','select 1',true),
        (2,'vestaboard-channels-every-15m','*/15 * * * *','select 1',true),
        (3,'notification-outbox-every-5m','*/5 * * * *','insert into worker_calls values (7)',true);`)
    const sql = await migration('20261008043000_disk_io_idle_jobs.sql')
    await db.exec(sql)
    const once = (await db.query('select * from cron.job order by jobid')).rows
    await db.exec(sql)
    assert.deepEqual((await db.query('select * from cron.job order by jobid')).rows, once)
    assert.equal(once[0].active, false)
    assert.equal(once[1].active, true)
    assert.equal(once[2].schedule, '*/5 * * * *')
    await db.exec(once[2].command)
    assert.equal((await db.query('select * from worker_calls')).rows.length, 0)
    await db.exec("insert into notification_outbox values ('scheduled',now()+interval '1 hour'),('sent',null),('failed',null)")
    await db.exec(once[2].command)
    assert.equal((await db.query('select * from worker_calls')).rows.length, 0)
    await db.exec("insert into notification_outbox values ('queued',null)")
    await db.exec(once[2].command)
    assert.equal((await db.query('select * from worker_calls')).rows.length, 1)
    await db.exec("update notification_outbox set status='sent'; insert into notification_outbox values ('scheduled',now()-interval '1 minute')")
    await db.exec(once[2].command)
    assert.equal((await db.query('select * from worker_calls')).rows.length, 2)
  } finally { await db.close() }
})

test('snapshot aligns new columns by name, preserves historical rows and fails before copying on future drift', async () => {
  const db = new PGlite()
  try {
    const tables = ['pos_orders','pos_order_items','pos_products','pos_categories','loyalty_customers']
    await db.exec('create role anon; create role authenticated; create role service_role;')
    for (const name of tables) {
      await db.exec(`create table ${name}(id int, label text);
        create table ${name}_archive(snapshot_date date, archived_at timestamptz, label text, id int);
        insert into ${name}_archive values(current_date-1,now(),'old',0);
        alter table ${name} add column cost numeric(12,3);
        insert into ${name} values(1,'today',1.125);`)
    }
    const sql = await migration('20261008043100_snapshot_schema_alignment.sql')
    await db.exec(sql)
    await db.exec(sql)
    assert.ok((await db.query("select relrowsecurity from pg_class where relname='loyalty_customers_archive'")).rows[0].relrowsecurity)
    assert.equal((await db.query("select has_function_privilege('anon','take_daily_snapshot()','execute') as allowed")).rows[0].allowed, false)
    assert.equal((await db.query('select * from pos_orders_archive')).rows.length, 1)
    const result = (await db.query('select take_daily_snapshot() as result')).rows[0].result
    assert.equal(result.orders, 1)
    assert.equal(result.order_items, 1)
    assert.equal(result.products, 1)
    for (const name of tables) {
      const rows = (await db.query(`select label,id,cost from ${name}_archive order by snapshot_date`)).rows
      assert.equal(rows.length, 2)
      assert.equal(rows[0].label, 'old')
      assert.equal(rows[0].cost, null)
      assert.equal(rows[1].label, 'today')
      assert.equal(rows[1].id, 1)
      assert.equal(Number(rows[1].cost), 1.125)
    }
    await db.exec('alter table loyalty_customers add column future_field text')
    await assert.rejects(db.query('select take_daily_snapshot()'), /Archive schema mismatch/)
    assert.equal((await db.query('select * from pos_orders_archive')).rows.length, 2)
  } finally { await db.close() }
})
