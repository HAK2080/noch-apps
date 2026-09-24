import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260924110000_reconciled_daily_sales_reporting.sql',
  import.meta.url,
)

test('daily report matches signed POS tenders, split legs and refunds', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.pos_orders (
        id uuid primary key, branch_id uuid not null, created_at timestamptz not null,
        status text not null, total numeric, discount_amount numeric,
        refunded_amount_lyd numeric
      );
      create table public.pos_tender_events (
        branch_id uuid not null, occurred_at timestamptz not null,
        tender_type text not null, event_type text not null, signed_amount_lyd numeric
      );
    `)
    const migration = await readFile(migrationUrl, 'utf8')
    const viewSql = migration.slice(
      migration.indexOf('create or replace view public.pos_sales_daily_reconciled'),
      migration.indexOf('grant select on public.pos_sales_daily_reconciled'),
    )
    await db.exec(viewSql)
    await db.exec(`
      insert into public.pos_orders values
        ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100','2026-09-23 19:00+00','completed',3265,0,74);
      insert into public.pos_tender_events values
        ('00000000-0000-0000-0000-000000000100','2026-09-23 19:00+00','cash','sale',1636),
        ('00000000-0000-0000-0000-000000000100','2026-09-23 19:00+00','card','sale',1629),
        ('00000000-0000-0000-0000-000000000100','2026-09-23 19:30+00','cash','refund',-61),
        ('00000000-0000-0000-0000-000000000100','2026-09-23 19:30+00','card','refund',-13);
    `)
    const { rows } = await db.query("select * from public.pos_sales_daily_reconciled where day = '2026-09-23'")
    assert.equal(rows.length, 1)
    assert.equal(Number(rows[0].completed_sales), 3265)
    assert.equal(Number(rows[0].net_sales), 3191)
    assert.equal(Number(rows[0].cash_net), 1575)
    assert.equal(Number(rows[0].card_net), 1616)
    assert.equal(Number(rows[0].period_refunds), 74)
    assert.equal(Number(rows[0].order_tender_variance), 0)

    await db.exec(`insert into public.pos_orders values
      ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000100','2026-09-24 01:30+00','completed',12,0,0);
    `)
    const { rows: afterMidnight } = await db.query("select * from public.pos_sales_daily_reconciled where day = '2026-09-23'")
    assert.equal(Number(afterMidnight[0].order_tender_variance), 12)
    assert.equal(Number(afterMidnight[0].net_sales), 3191)
  } finally {
    await db.close()
  }
})
