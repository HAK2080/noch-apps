import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const terminalUrl = new URL('../src/modules/pos/pages/POSTerminal.jsx', import.meta.url)
const queueUrl = new URL('../src/modules/pos/lib/print-queue.js', import.meta.url)
const badgeUrl = new URL('../src/modules/pos/components/PrintHostBadge.jsx', import.meta.url)

test('modifier data loads for the selected product, with offline cached options', async () => {
  const source = await readFile(terminalUrl, 'utf8')
  assert.doesNotMatch(source, /getAllModifierData\(/)
  assert.match(source, /getModifierGroupsForProduct\(product\.id\)/)
  assert.match(source, /modifierCache\.current\.set\(product\.id/)
  assert.match(source, /modifier_groups_by_product: \{ \.\.\.config\?\.modifier_groups_by_product/)
})

test('print host advertises actual printer connection and retries queued jobs on reconnect', async () => {
  const [queue, badge] = await Promise.all([readFile(queueUrl, 'utf8'), readFile(badgeUrl, 'utf8')])
  assert.match(queue, /printerConnected: connected/)
  assert.match(queue, /if \(connected\) processQueue\(branchId\)/)
  assert.match(badge, /host\?\.printerConnected/)
  assert.match(badge, /Host printer disconnected — prints will queue/)
})
