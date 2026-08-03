import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

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
