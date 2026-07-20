import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'

const installerUrl = '/noch-print-agent/Noch-Bloom-Printer-Setup.exe'
const installerPath = new URL('../public/noch-print-agent/Noch-Bloom-Printer-Setup.exe', import.meta.url)
const settingsPath = new URL('../src/modules/pos/pages/POSSettings.jsx', import.meta.url)

test('Bloom exposes a real Windows installer instead of a script-only ZIP', async () => {
  const info = await stat(installerPath)
  assert.ok(info.size > 10_000, 'installer should contain the packaged print agent')

  const executable = await readFile(installerPath)
  assert.equal(executable.subarray(0, 2).toString('ascii'), 'MZ')

  const settings = await readFile(settingsPath, 'utf8')
  assert.match(settings, new RegExp(installerUrl.replaceAll('.', '\\.'), 'u'))
  assert.match(settings, /Install Bloom Printer/u)
  assert.doesNotMatch(settings, /href="\/noch-print-agent\/noch-print-agent\.zip"/u)
})
