import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowUrl = new URL('../../../.github/workflows/weekly-supabase-backup.yml', import.meta.url)
const exporterUrl = new URL('../../../scripts/backup-supabase.mjs', import.meta.url)

const workflow = await readFile(workflowUrl, 'utf8')

// Read a step's body straight from the YAML text. A parser would mean leaning
// on js-yaml, which this app only has transitively — an unrelated dependency
// bump could then break a backup test for no reason.
function stepBody(name) {
  const start = workflow.indexOf(`      - name: ${name}`)
  assert.ok(start > 0, `step "${name}" should exist`)
  const next = workflow.indexOf('\n      - name: ', start + 1)
  return workflow.slice(start, next === -1 ? undefined : next)
}

test('the database is backed up daily, not weekly', () => {
  // Supabase Free includes no backups, so this workflow is the only copy of the
  // business data. A weekly cadence risked seven days of orders and expenses.
  const crons = [...workflow.matchAll(/^\s*- cron: '([^']+)'/gm)].map(m => m[1])
  assert.deepEqual(crons, ['0 2 * * *'], 'expected exactly one daily 02:00 UTC schedule')
  assert.match(workflow, /^\s*workflow_dispatch:/m, 'an owner must be able to run it on demand')
})

test('the backup is encrypted before it leaves the runner', () => {
  const body = stepBody('Encrypt backup')
  assert.match(body, /openssl enc -aes-256-cbc/)
  assert.match(body, /test -n "\$BACKUP_PASSWORD"/, 'must refuse to run without a password')
  assert.match(body, /rm -rf tmp\/supabase-backup/, 'the plaintext export must not survive the step')
})

test('a second copy is kept on the VPS, independent of GitHub', () => {
  const body = stepBody('Copy backup to the VPS')
  assert.match(body, /scp /)
  assert.match(body, /KEEP: '14'/)
})

test('an interrupted transfer cannot masquerade as a good backup', () => {
  const body = stepBody('Copy backup to the VPS')
  assert.match(body, /\$NAME\.part/)
  assert.match(body, /mv -f \$BACKUP_DIR\/\$NAME\.part \$BACKUP_DIR\/\$NAME/)
})

test('the copy is verified by checksum and a bad copy is removed', () => {
  const body = stepBody('Copy backup to the VPS')
  assert.match(body, /LOCAL_SUM=/)
  assert.match(body, /REMOTE_SUM=/)
  assert.match(body, /if \[ "\$LOCAL_SUM" != "\$REMOTE_SUM" \]/)
  assert.match(body, /rm -f \$BACKUP_DIR\/\$NAME/, 'a mismatched copy must not be kept')
  assert.match(body, /exit 1/, 'and the run must fail loudly')
})

test('rotation happens only after the new copy is verified', () => {
  const body = stepBody('Copy backup to the VPS')
  const verifyAt = body.indexOf('LOCAL_SUM')
  const rotateAt = body.indexOf('tail -n +$((KEEP + 1))')
  assert.ok(verifyAt > 0 && rotateAt > 0, 'both verification and rotation must be present')
  assert.ok(
    rotateAt > verifyAt,
    'deleting old backups before the new one is verified can leave no good backup at all',
  )
})

test('the export still covers the data that cannot be recreated', async () => {
  const exporter = await readFile(exporterUrl, 'utf8')
  assert.match(exporter, /auth\/v1\/admin\/users/, 'staff logins must be exported')
  assert.match(exporter, /rest\/v1\//, 'table rows must be exported')
  assert.match(exporter, /sha256/, 'each file must carry a checksum')
  // Known and accepted gaps, asserted so a future change has to think about
  // them: the schema lives in supabase/migrations, and storage files (product
  // photos and videos) are still not backed up anywhere.
  assert.match(exporter, /storage_files: false/)
  assert.match(exporter, /database_schema: false/)
})
