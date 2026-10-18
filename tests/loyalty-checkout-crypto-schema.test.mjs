import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migration = await readFile(new URL('../supabase/migrations/20261018101000_fix_loyalty_checkout_crypto_schema.sql', import.meta.url), 'utf8')
const rules = [...migration.matchAll(/regexp_replace\((?:before_definition|after_definition),\s*'([^']+)',\s*'([^']+)', 'gi'\)/g)]
function patch(source) {
  return rules.reduce((result, [, sqlPattern, sqlReplacement]) => {
    const pattern = sqlPattern.replaceAll('[[:space:]]', '\\s').replaceAll('[:alnum:]', 'A-Za-z0-9')
    const replacement = sqlReplacement.replace(/\\(\d)/g, (_, digit) => '$' + digit)
    return result.replace(new RegExp(pattern, 'gi'), replacement)
  }, source)
}

test('migration targets only the three checkout functions and guards security metadata', () => {
  assert.equal(rules.length, 2)
  assert.match(migration, /public\.create_loyalty_checkout_v2\(uuid,uuid\)/)
  assert.match(migration, /public\.claim_loyalty_checkout_v2\(text\)/)
  assert.match(migration, /public\.get_my_loyalty_checkout_v2\(text\)/)
  assert.match(migration, /after_security is distinct from before_security/)
  assert.doesNotMatch(migration, /\b(?:insert into|update public|delete from|alter role|grant execute|set search_path)\b/i)
})

for (const [name, file] of [
  ['create_loyalty_checkout_v2', '20260731233000_loyalty_customer_control.sql'],
  ['claim_loyalty_checkout_v2', '20260731233000_loyalty_customer_control.sql'],
  ['get_my_loyalty_checkout_v2', '20260730180000_loyalty_v2.sql'],
]) {
  test(name + ': preserve the whole function except crypto qualification', async () => {
    const sql = await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')
    const start = sql.indexOf('create or replace function public.' + name + '(')
    assert.ok(start >= 0)
    const end = sql.indexOf('create or replace function ', start + 1)
    const definition = sql.slice(start, end < 0 ? undefined : end)
    const expected = definition.replaceAll('encode(gen_random_bytes(', 'encode(extensions.gen_random_bytes(')
      .replaceAll('encode(digest(', 'encode(extensions.digest(')
    assert.notEqual(expected, definition)
    assert.equal(patch(definition), expected)
    assert.equal(patch(expected), expected)
    assert.match(expected, /security definer[\s\S]*set search_path = public/i)
  })
}

test('qualification does not corrupt qualified calls or similar identifiers', () => {
  const source = 'extensions.digest(x,y); public.digest(x,y); other_digest(x,y); notgen_random_bytes(1);'
  assert.equal(patch(source), source)
  assert.equal(patch('encode( digest (x,y), gen_random_bytes (24))'),
    'encode( extensions.digest(x,y), extensions.gen_random_bytes(24))')
})

test('live functional verification cannot commit fixtures or change points', async () => {
  const sql = await readFile(new URL('./sql/loyalty-checkout-crypto-rollback.sql', import.meta.url), 'utf8')
  assert.match(sql, /begin isolation level repeatable read;/i)
  assert.match(sql, /rollback;\s*select 'PASS:/i)
  assert.doesNotMatch(sql, /^\s*commit\b/im)
  for (const name of ['create_loyalty_checkout_v2', 'claim_loyalty_checkout_v2', 'get_my_loyalty_checkout_v2']) {
    assert.ok(sql.includes('public.' + name + '('))
  }
  assert.match(sql, /point_count_before <>/)
  assert.match(sql, /point_sum_before <>/)
})
