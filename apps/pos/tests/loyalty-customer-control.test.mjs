import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260731233000_loyalty_customer_control.sql',
  import.meta.url,
)

test('loyalty capture records one immutable linked or skipped decision per order', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create table if not exists public\.loyalty_capture_events/i)
  assert.match(sql, /create unique index if not exists loyalty_capture_one_resolution_idx/i)
  assert.match(sql, /create unique index if not exists loyalty_capture_one_unknown_idx/i)
  assert.match(sql, /create or replace function public\.record_loyalty_capture_decision_v2/i)
  assert.match(sql, /Loyalty capture decision is immutable once recorded/i)
  assert.match(sql, /'customer_qr', 'existing_card', 'phone_fallback'/i)
})

test('customer identity and consent controls preserve ambiguous records and fail closed', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create table if not exists public\.loyalty_identity_exception_cases/i)
  assert.match(sql, /legacy_no_provenance/i)
  assert.match(sql, /create table if not exists public\.loyalty_consent_events/i)
  assert.match(sql, /create or replace function public\.loyalty_contact_eligibility_v2/i)
  assert.match(sql, /whatsapp_consent_unverified/i)
  assert.match(sql, /marketing_consent_unverified/i)
  assert.match(sql, /member_self_service/i)
})

test('owner reporting uses Tripoli business days and masked customer access', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create or replace function public\.loyalty_v2_owner_summary/i)
  assert.match(sql, /Africa\/Tripoli/i)
  assert.match(sql, /'business_day_start', '05:00'/i)
  assert.match(sql, /create or replace function public\.loyalty_v2_customer_directory/i)
  assert.match(sql, /create or replace function public\.search_loyalty_members_v2/i)
  assert.match(sql, /masked_phone/i)
  assert.match(sql, /create table if not exists public\.loyalty_customer_access_events/i)
})

test('mission revisions require bilingual customer-facing copy', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create or replace function public\.create_loyalty_mission_version_v3/i)
  assert.match(sql, /English and Arabic mission titles are required/i)
  assert.match(sql, /title,\s*title_ar,\s*description,\s*description_ar/i)
})
