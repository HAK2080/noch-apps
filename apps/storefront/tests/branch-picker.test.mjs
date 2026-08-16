import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const migration = await readFile(
  new URL('../../../supabase/migrations/20260816170000_public_branch_visibility.sql', import.meta.url),
  'utf8',
)
const deployWorkflow = await readFile(
  new URL('../../../.github/workflows/deploy-storefront.yml', import.meta.url),
  'utf8',
)

test('public branch picker loads owner-selected statuses from the safe RPC', () => {
  assert.match(source, /sb\.rpc\('get_public_branch_listings'\)/)
  assert.match(source, /branch\.operational_status !== 'closed'/)
  assert.match(source, /b\.status === 'pre_opening'/)
  assert.match(source, /window\.location\.href = `\$\{MENU_BASE\}\/\$\{b\.id\}`/)
})

test('branch picker fails closed if the public feed is unavailable', () => {
  assert.match(source, /const \[branches, setBranches\] = useState\(\[\]\)/)
  assert.match(source, /setBranches\(\[\]\)/)
  assert.match(source, /pickerEmpty: "No branches available right now\."/)
  assert.doesNotMatch(source, /FALLBACK_BRANCHES/)
})

test('public branch RPC exposes only display fields and omits hidden branches', () => {
  assert.match(migration, /returns table \([\s\S]*id uuid,[\s\S]*name text,[\s\S]*name_ar text,[\s\S]*location text,[\s\S]*operational_status text/)
  assert.match(migration, /branch\.operational_status = 'pre_opening'/)
  assert.doesNotMatch(migration, /select\s+branch\.\*/)
  assert.match(migration, /grant execute on function public\.get_public_branch_listings\(\) to anon, authenticated/)
})

test('storefront deployment installs locked dependencies before building', () => {
  const installAt = deployWorkflow.indexOf('- run: npm ci')
  const deployAt = deployWorkflow.indexOf('run: python deploy.py storefront')
  assert.ok(installAt >= 0)
  assert.ok(deployAt > installAt)
  assert.match(deployWorkflow, /- run: npm ci\s+working-directory: apps\/storefront/)
})
