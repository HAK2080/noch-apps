import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { convertLegacyValue } from '../src/modules/loyalty/lib/loyalty-v2.js'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260730180000_loyalty_v2.sql',
  import.meta.url,
)

test('V2 preserves existing points and converts incomplete stamps in the member favor', () => {
  assert.deepEqual(
    convertLegacyValue({
      existingPoints: 10,
      currentStamps: 8,
      legacyStampGoal: 9,
      rewardPoints: 200,
    }),
    {
      existingPoints: 10,
      convertedStampPoints: 178,
      openingPoints: 188,
    },
  )
})

test('V2 conversion never creates value from empty or invalid legacy counters', () => {
  assert.deepEqual(
    convertLegacyValue({
      existingPoints: -5,
      currentStamps: null,
      legacyStampGoal: 0,
      rewardPoints: 200,
    }),
    {
      existingPoints: 0,
      convertedStampPoints: 0,
      openingPoints: 0,
    },
  )
})

test('V1 identities, value, and pending rewards are archived and transferred', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create table if not exists public\.loyalty_v1_customer_archive/i)
  assert.match(sql, /create table if not exists public\.loyalty_v1_stamp_archive/i)
  assert.match(sql, /insert into public\.loyalty_v2_memberships/i)
  assert.match(sql, /greatest\(coalesce\(c\.points,\s*0\),\s*0\)/i)
  assert.match(sql, /ceil\([\s\S]*current_stamps[\s\S]*stamp_goal[\s\S]*200/i)
  assert.match(sql, /event_type[\s\S]*'opening_balance'/i)
  assert.match(sql, /legacy_reward_id/i)
  assert.match(sql, /r\.status = 'pending'/i)
  assert.match(sql, /drop trigger if exists trg_award_checkout_loyalty_stamps/i)
  assert.match(sql, /create trigger loyalty_v1_freeze_order_stamps/i)
  assert.match(sql, /'archived',\s*true/i)
})

test('V2 settlement is idempotent and reverses voided or refunded value', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create table if not exists public\.loyalty_v2_point_events/i)
  assert.match(sql, /idempotency_key text not null unique/i)
  assert.match(sql, /create or replace function public\.settle_loyalty_order_v2/i)
  assert.match(sql, /greatest\(coalesce\(v_order\.total,\s*0\)\s*-\s*coalesce\(v_order\.refunded_amount_lyd,\s*0\),\s*0\)/i)
  assert.match(sql, /refund_reversal|void_reversal/i)
  assert.match(sql, /after insert or update of refunded_qty on public\.pos_order_items/i)
  assert.match(sql, /after update of status,\s*refunded_amount_lyd on public\.pos_orders/i)
})

test('V2 checkout QR claims are hashed, expiring, transaction-bound, and single-use', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create table if not exists public\.loyalty_v2_checkout_sessions/i)
  assert.match(sql, /token_hash text not null unique/i)
  assert.match(sql, /digest\(p_token,\s*'sha256'\)/i)
  assert.match(sql, /expires_at[\s\S]*interval '5 minutes'/i)
  assert.match(sql, /status in \('open',\s*'claimed',\s*'settled',\s*'expired',\s*'cancelled'\)/i)
  assert.match(sql, /create or replace function public\.claim_loyalty_checkout_v2/i)
  assert.match(sql, /create or replace function public\.get_my_loyalty_checkout_v2/i)
  assert.match(sql, /auth\.uid\(\) is null/i)
  assert.match(sql, /for update/i)
})

test('V2 missions are limited, order-driven, and idempotent', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /mission_type[\s\S]*repeat_visit[\s\S]*selected_product[\s\S]*selected_category[\s\S]*quiet_hours/i)
  assert.match(sql, /unique \(mission_id,\s*customer_id,\s*order_id\)/i)
  assert.match(sql, /limit 2/i)
  assert.match(sql, /Only two Loyalty V2 missions may overlap/i)
  assert.match(sql, /mission_bonus/i)
  assert.match(sql, /create or replace function public\.create_loyalty_mission_version_v2/i)
  assert.match(sql, /Mission rules are immutable; create a new mission version/i)
})

test('V2 reward redemption validates the paid order and eligible items', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create or replace function public\.get_available_loyalty_rewards_v2/i)
  assert.match(sql, /create or replace function public\.redeem_loyalty_reward_v2/i)
  assert.match(sql, /order does not contain an eligible reward item/i)
  assert.match(sql, /order does not include the configured reward discount/i)
  assert.match(sql, /status = 'redeemed'/i)
  assert.match(sql, /create or replace function public\.create_pos_order_with_loyalty_reward_v2/i)
  assert.match(
    sql,
    /v_result := public\.create_pos_order\([\s\S]*v_redemption := public\.redeem_loyalty_reward_v2\(/i,
  )
  assert.match(sql, /v_reward\.status = 'redeemed'[\s\S]*v_reward\.redeemed_order_id = p_order_id/i)
})
