import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const dashboard = fs.readFileSync(
  path.resolve(testDirectory, '../src/pages/Dashboard.jsx'),
  'utf8',
)
const actionCard = fs.readFileSync(
  path.resolve(testDirectory, '../src/components/intelligence/ActionCard.jsx'),
  'utf8',
)
const businessEvents = fs.readFileSync(
  path.resolve(testDirectory, '../src/lib/businessEvents.js'),
  'utf8',
)

test('dashboard refreshes suggested actions after a card is dismissed', () => {
  assert.match(actionCard, /function ActionCard\(\{ action, onUpdate \}\)/)
  assert.match(actionCard, /await dismissSuggestedAction\(action\.id\)[\s\S]*?onUpdate\?\.\(action\.id\)/)
  assert.match(dashboard, /setSuggestedActions\(current => current\.filter\(action => action\.id !== actionId\)\)/)
  assert.match(dashboard, /<ActionCard key=\{a\.id\} action=\{a\} onUpdate=\{handleSuggestedActionUpdate\} \/>/)
})

test('a dismissed signal is not recreated during the 24-hour cooldown', () => {
  const alreadyFiredBody = businessEvents.match(/async function alreadyFired[\s\S]*?return count > 0\r?\n}/)?.[0] || ''
  assert.notEqual(alreadyFiredBody, '')
  assert.doesNotMatch(alreadyFiredBody, /\.is\('resolved_at', null\)/)
})
