import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTH_POLICY,
  OWNER_POLICY,
  canAccessPolicy,
  featurePolicy,
  getLandingRoute,
  isAccountEnabled,
} from '../src/lib/access-control.js'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = fs.readFileSync(path.join(testDir, '../src/App.jsx'), 'utf8')
const featureSource = fs.readFileSync(path.join(testDir, '../src/lib/features.js'), 'utf8')
const layoutSource = fs.readFileSync(path.join(testDir, '../src/components/Layout.jsx'), 'utf8')
const roleManagerSource = fs.readFileSync(path.join(testDir, '../src/pages/staff/RoleManager.jsx'), 'utf8')
const migrationSource = fs.readFileSync(
  path.join(testDir, '../../../supabase/migrations/20260731235000_access_control_navigation.sql'),
  'utf8',
)

test('account access is separate from employee activity', () => {
  assert.equal(isAccountEnabled({ role: 'owner', is_active: false, access_enabled: true }), true)
  assert.equal(isAccountEnabled({ role: 'staff', is_active: true, access_enabled: false }), false)
  assert.equal(isAccountEnabled({ role: 'staff', is_active: false, access_enabled: true }), true)
})

test('one policy evaluator gates owner, access, and edit decisions', () => {
  const staff = {
    profile: { role: 'staff', access_enabled: true },
    permissions: {
      pos: { can_access: true, can_edit: false },
      inventory: { can_access: true, can_edit: true },
    },
  }
  assert.equal(canAccessPolicy(AUTH_POLICY, staff), true)
  assert.equal(canAccessPolicy(OWNER_POLICY, staff), false)
  assert.equal(canAccessPolicy(featurePolicy('pos'), staff), true)
  assert.equal(canAccessPolicy(featurePolicy('pos', 'edit'), staff), false)
  assert.equal(canAccessPolicy(featurePolicy('inventory', 'edit'), staff), true)
  assert.equal(canAccessPolicy(featurePolicy('pos'), { ...staff, profile: { ...staff.profile, access_enabled: false } }), false)
  assert.equal(canAccessPolicy(OWNER_POLICY, { profile: { role: 'owner', access_enabled: true }, isOwner: true }), true)
})

test('landing route is the first actually granted daily workflow', () => {
  assert.equal(getLandingRoute({ profile: { role: 'staff', access_enabled: true }, permissions: { pos: { can_access: true } } }), '/pos')
  assert.equal(getLandingRoute({ profile: { role: 'accountant', access_enabled: true }, permissions: { dashboard: { can_access: true } } }), '/dashboard')
  assert.equal(getLandingRoute({ profile: { role: 'limited_staff', access_enabled: true }, permissions: {} }), '/my-tasks')
})

test('navigation and direct routes share policies without role fallbacks', () => {
  assert.doesNotMatch(featureSource, /fallbackRoles|ownerOnly/)
  assert.doesNotMatch(appSource, /function OwnerRoute|function PermissionRoute|<OwnerRoute|<PermissionRoute/)
  assert.match(appSource, /function AccessRoute/)
  assert.match(appSource, /featurePolicy\('pos_eod'\)/)
  assert.match(appSource, /featurePolicy\('inventory', 'edit'\)/)
  assert.match(layoutSource, /canAccess\(item\.policy\)/)
  assert.match(layoutSource, /All available pages/)
  assert.doesNotMatch(layoutSource, /navLinkItems\.slice\(0, 5\)/)
})

test('role manager and navigation provide explicit Arabic owner language', () => {
  assert.match(featureSource, /لوحة الأعمال/)
  assert.match(roleManagerSource, /الأدوار والوصول/)
  assert.match(roleManagerSource, /دخول الحسابات/)
  assert.match(layoutSource, /كل الصفحات المتاحة/)
})

test('database migration preserves records and audits privileged changes', () => {
  assert.match(migrationSource, /add column if not exists access_enabled boolean not null default false/i)
  assert.match(migrationSource, /create table if not exists public\.access_control_events/i)
  assert.match(migrationSource, /create or replace function public\.protect_profile_access_fields_v2/i)
  assert.match(migrationSource, /Sensitive profile fields require owner access/)
  assert.match(migrationSource, /create or replace function public\.update_role_permission_v2/i)
  assert.match(migrationSource, /revoke insert, update, delete on public\.role_permissions from authenticated/i)
  assert.doesNotMatch(migrationSource, /delete from public\.profiles|drop table public\.profiles/i)
})
