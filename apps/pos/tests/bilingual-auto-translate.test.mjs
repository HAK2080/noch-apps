import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { repairMojibake } from '../src/lib/uiAutoTranslate.js'

const sourceUrl = new URL('../src/lib/uiAutoTranslate.js', import.meta.url)

test('automatic Arabic translation only remembers text it actually translates', async () => {
  const source = await readFile(sourceUrl, 'utf8')

  assert.match(source, /const translated = translateExact\(source\)/)
  assert.match(source, /if \(translated !== source\) \{[\s\S]*originalText\.set\(node, source\)/)
  assert.match(source, /const translated = PLACEHOLDERS\[current\] \|\| PHRASES\[current\]/)
  assert.match(source, /if \(!translated\) return/)
  assert.doesNotMatch(source, /if \(!originalText\.has\(node\)\) originalText\.set\(node, node\.nodeValue\)/)
})


test('repairs legacy UTF-8/Latin-1 Arabic literals before rendering', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  assert.match(source, /function repairMojibake\(value\)/)
  assert.match(source, /new TextDecoder\('utf-8', \{ fatal: true \}\)/)
  assert.match(source, /const PHRASES = repairDictionary\(/)
  assert.match(source, /const PLACEHOLDERS = repairDictionary\(/)
})


test('repairs single and double encoded Arabic without Arabic source literals', () => {
  const expected = '\u062a\u0635\u062f\u064a\u0631'
  const corrupt = value => new TextDecoder('windows-1252').decode(new TextEncoder().encode(value))
  assert.equal(repairMojibake(corrupt(expected)), expected)
  assert.equal(repairMojibake(corrupt(corrupt(expected))), expected)
})


test('repairs text updates after lazy screens have mounted', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  assert.match(source, /characterData: true/)
  assert.match(source, /WINDOWS_1252_BYTES/)
})
