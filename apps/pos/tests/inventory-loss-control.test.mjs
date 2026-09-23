import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260923140000_inventory_loss_control.sql', import.meta.url),
  'utf8',
)
const page = readFileSync(new URL('../src/pages/inventory/LossControl.jsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const hub = readFileSync(new URL('../src/pages/InventoryHub.jsx', import.meta.url), 'utf8')

test('loss checks preserve immutable expected-versus-physical evidence', () => {
  assert.match(migration, /create table if not exists public\.inventory_loss_checks/i)
  assert.match(migration, /expected_qty numeric/i)
  assert.match(migration, /counted_qty numeric/i)
  assert.match(migration, /unaccounted_qty numeric/i)
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete).*inventory_loss_checks.*authenticated/is)
})

test('the first count is a baseline and later checks calculate unexplained loss', () => {
  assert.match(migration, /if v_period_start is null then[\s\S]*v_expected := round\(p_counted_qty, 3\)/i)
  assert.match(migration, /greatest\(v_expected - p_counted_qty, 0\)/i)
  assert.match(migration, /o\.status = 'completed'/i)
  assert.match(migration, /oi\.refunded_qty/i)
})

test('ingredients require explicit recipe evidence', () => {
  assert.match(migration, /Link this ingredient to a sold recipe before loss checks/i)
  assert.match(migration, /join public\.recipe_ingredients/i)
})

test('loss control stays simple and provides dated drill-down', () => {
  assert.match(page, /Only stock that could not be accounted for/)
  assert.match(page, /Movement timeline/)
  assert.match(page, /period_started_at/)
  assert.doesNotMatch(page, /Review \/ Confirmed/)
})

test('owner route and inventory entry point are wired', () => {
  assert.match(app, /inventory\/loss-control/)
  assert.match(app, /policy=\{OWNER_POLICY\}><LossControl/)
  assert.match(hub, /navigate\('\/inventory\/loss-control'\)/)
})
