import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260731234000_content_measurement_control.sql',
  import.meta.url,
)

test('publication and measurement records have stable business identities', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create table if not exists public\.cs_publications/i)
  assert.match(sql, /idempotency_key text not null/i)
  assert.match(sql, /objective_type text not null/i)
  assert.match(sql, /product_ids uuid\[\]/i)
  assert.match(sql, /create table if not exists public\.cs_performance_snapshots/i)
  assert.match(sql, /unique \(publication_id,\s*horizon\)/i)
  assert.match(sql, /horizon in \('24h',\s*'7d',\s*'final'\)/i)
})

test('legacy evidence is preserved while new reporting has one authority', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /legacy-bank:/i)
  assert.match(sql, /perf_post_url/i)
  assert.match(sql, /create or replace function public\.content_measurement_summary_v2/i)
  assert.match(sql, /'approved_use'/i)
  assert.match(sql, /'evidence'/i)
  assert.match(sql, /'causal_claims_allowed', false/i)
})

test('Content Studio business data is owner-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create or replace function public\.content_studio_is_owner_v2/i)
  assert.match(sql, /drop policy if exists/i)
  assert.match(sql, /for all to authenticated using \(public\.content_studio_is_owner_v2\(\)\)/i)
})
