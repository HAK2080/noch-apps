import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const migration = fs.readFileSync(path.join(testDir, '../../../supabase/migrations/20260731235500_system_acceptance_privacy.sql'), 'utf8')
const alignmentMigration = fs.readFileSync(path.join(testDir, '../../../supabase/migrations/20260731235600_auth_identity_alignment.sql'), 'utf8')
const workforceBoundaryMigration = fs.readFileSync(path.join(testDir, '../../../supabase/migrations/20260731235700_workforce_directory_boundary.sql'), 'utf8')
const profiles = fs.readFileSync(path.join(testDir, '../src/lib/profiles.js'), 'utf8')
const pinLogin = fs.readFileSync(path.join(testDir, '../src/modules/pos/pages/POSPinLogin.jsx'), 'utf8')
const attendees = fs.readFileSync(path.join(testDir, '../src/modules/pos/components/ShiftAttendees.jsx'), 'utf8')
const tasks = fs.readFileSync(path.join(testDir, '../src/lib/tasks.js'), 'utf8')

test('profile base rows are owner-or-self while daily directories are privacy-safe', () => {
  assert.match(migration, /create policy profiles_select_v2/i)
  assert.match(migration, /public\.access_control_is_owner_v2\(\)/)
  assert.match(migration, /or id = auth\.uid\(\)/)
  assert.match(migration, /or auth_user_id = auth\.uid\(\)/)
  assert.doesNotMatch(migration, /profiles_select_v2[\s\S]{0,250}using \(true\)/i)

  const directoryReturn = migration.match(/returns table \([\s\S]*?\)\n(?:language|LANGUAGE)/i)?.[0] || ''
  assert.match(directoryReturn, /full_name text/)
  assert.match(directoryReturn, /pin_configured boolean/)
  assert.doesNotMatch(directoryReturn, /phone|telegram|salary|hourly_rate|pin_code/)
})

test('profile and POS callers use the safe self/directory interfaces', () => {
  assert.match(profiles, /supabase\.rpc\('my_profile_v2'\)/)
  assert.match(profiles, /supabase\.rpc\('profile_directory_v2'/)
  assert.doesNotMatch(profiles, /from\('profiles'\)[\s\S]{0,80}select\('\*'\)/)
  assert.match(pinLogin, /getProfileDirectory\(\{ activeOnly: true, pinOnly: true, branchId \}\)/)
  assert.match(attendees, /getProfileDirectory\(\)/)
})

test('task people are hydrated through the safe directory instead of profile joins', () => {
  assert.match(tasks, /supabase\.rpc\('profile_directory_v2'/)
  assert.match(tasks, /ownerDirectory\.error \? \[\] : ownerDirectory\.data/)
  assert.match(tasks, /return hydrateTasks\(data \|\| \[\]\)/)
  assert.doesNotMatch(tasks, /assignee:profiles|author:profiles/)
})

test('the owner workforce directory returns no rows to non-managers', () => {
  assert.match(workforceBoundaryMigration, /and public\.workforce_can_manage\(\)/)
  assert.match(workforceBoundaryMigration, /daily staff pickers use profile_directory_v2/i)
  assert.doesNotMatch(workforceBoundaryMigration, /update public\.profiles|delete from public\.profiles/i)
})

test('future auth links cannot bypass legacy id-based policy assumptions', () => {
  assert.match(alignmentMigration, /profiles_auth_identity_alignment/)
  assert.match(alignmentMigration, /auth_user_id is null or auth_user_id = id/)
  assert.match(alignmentMigration, /validate constraint profiles_auth_identity_alignment/)
  assert.doesNotMatch(alignmentMigration, /update public\.profiles|delete from public\.profiles/i)
})
