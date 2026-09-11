#!/usr/bin/env node
/**
 * Apply ONE migration file to the Noch Supabase project.
 *
 * Usage:
 *   node scripts/apply-migration.js supabase/migrations/<file>.sql [--dry-run]
 *
 * Requires SUPABASE_ACCESS_TOKEN in the repository root .env (never committed).
 * Get one from https://supabase.com/dashboard/account/tokens
 *
 * Unlike the frozen repair script scripts/migrate.js, this applies exactly the
 * file you name and nothing else. Migration files wrap their own begin/commit,
 * so a failure rolls back.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_REF = 'kxqjasdvoohiexedtfqw'

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  let raw = ''
  try { raw = readFileSync(join(root, '.env'), 'utf8') } catch { return null }
  const line = raw.split(/\r?\n/).find(l => l.trimStart().startsWith('SUPABASE_ACCESS_TOKEN='))
  if (!line) return null
  return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') || null
}

export async function runSQL(sql, token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  let body
  try { body = await res.json() } catch { body = null }
  if (!res.ok || body?.error) {
    const detail = body?.error || body?.message || `HTTP ${res.status}`
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return body
}

async function main() {
  const file = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!file || file.startsWith('--')) {
    console.error('Usage: node scripts/apply-migration.js <path-to-.sql> [--dry-run]')
    process.exit(2)
  }

  let sql
  try { sql = readFileSync(join(root, file), 'utf8') } catch {
    console.error(`Cannot read migration: ${file}`)
    process.exit(2)
  }

  console.log(`Project: ${PROJECT_REF}`)
  console.log(`Migration: ${file} (${sql.split(/\r?\n/).length} lines)`)

  if (dryRun) {
    console.log('\nDry run: nothing was sent. Remove --dry-run to apply.')
    return
  }

  const token = loadToken()
  if (!token) {
    console.error('\nSUPABASE_ACCESS_TOKEN not found in environment or .env')
    console.error('Add it to the repository root .env, then re-run.')
    process.exit(1)
  }

  await runSQL(sql, token)
  console.log('\nApplied successfully.')
}

if (process.argv[1] && process.argv[1].endsWith('apply-migration.js')) {
  main().catch(err => {
    console.error(`\nFailed: ${err.message}`)
    console.error('The migration wraps itself in a transaction, so no partial change was committed.')
    process.exit(1)
  })
}
