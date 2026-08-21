import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reportUrl = new URL('../src/pages/Report.jsx', import.meta.url)

test('management report renders unavailable branch and stock values without crashing', async () => {
  const source = await readFile(reportUrl, 'utf8')

  assert.match(source, /countValue\(row\.orders\)/)
  assert.match(source, /countValue\(item\.minThreshold\)/)
  assert.match(source, /countValue\(item\.theoreticalQty\)/)
  assert.doesNotMatch(source, /row\.orders\.toLocaleString/)
  assert.doesNotMatch(source, /item\.minThreshold\.toLocaleString/)
  assert.doesNotMatch(source, /item\.theoreticalQty\.toLocaleString/)
})
