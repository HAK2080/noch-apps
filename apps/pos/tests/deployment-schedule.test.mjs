import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowUrl = new URL('../../../.github/workflows/deploy-admin.yml', import.meta.url)

test('apps.noch.cloud deployment runs daily at 03:00 Saudi time', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')

  assert.match(workflow, /03:00 Asia\/Riyadh/)
  assert.match(workflow, /cron:\s*'0 0 \* \* \*'/)
  assert.match(workflow, /run:\s*python deploy\.py apps/)
})
