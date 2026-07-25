import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { getCashCloseState } from '../src/modules/pos/lib/end-of-day-close.js'
import { buildTranslationPhrases } from '../src/lib/uiAutoTranslate.js'

test('blank cash requires confirmation but remains closable', () => {
  assert.deepEqual(getCashCloseState('', 100), {
    isMissing: true,
    isInvalid: false,
    closingCash: 0,
    difference: -100,
  })
})

test('a counted zero is valid and does not look missing', () => {
  assert.deepEqual(getCashCloseState('0', 100), {
    isMissing: false,
    isInvalid: false,
    closingCash: 0,
    difference: -100,
  })
})

test('invalid or negative cash is rejected', () => {
  assert.equal(getCashCloseState('-1', 100).isInvalid, true)
  assert.equal(getCashCloseState('not-a-number', 100).isInvalid, true)
})

test('shared end-of-day screen wires Arabic and blank-count confirmation', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/pos/pages/POSEndOfDay.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /useLanguage\(\)/)
  assert.match(source, /showMissingCashWarning/)
  assert.match(source, /data-closeout-metric/)
  assert.match(source, /handleCloseShift\(true\)/)
})

test('global legacy UI translation uses the main English/Arabic dictionary', () => {
  const phrases = buildTranslationPhrases({
    en: { eodTitle: 'End of Day', close: 'Close Shift' },
    ar: { eodTitle: 'إقفال الوردية', close: 'إقفال الوردية' },
  })

  assert.equal(phrases['End of Day'], 'إقفال الوردية')
  assert.equal(phrases['Close Shift'], 'إقفال الوردية')
})
