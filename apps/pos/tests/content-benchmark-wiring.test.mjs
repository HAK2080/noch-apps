import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  addUniqueSample,
  getBenchmarkSummary,
} from '../src/modules/contentStudio/lib/contentBenchmark.js'

const src = new URL('../src/modules/contentStudio/', import.meta.url)

test('Voice Lab exposes the profile-native content benchmark', async () => {
  const voiceLab = await readFile(new URL('pages/VoiceLab.jsx', src), 'utf8')
  const benchmark = await readFile(new URL('components/ContentBenchmark.jsx', src), 'utf8')
  const evaluator = await readFile(
    new URL('../../../supabase/functions/cs-evaluate-draft/index.ts', import.meta.url),
    'utf8',
  )

  assert.match(voiceLab, /import ContentBenchmark/)
  assert.match(voiceLab, /<ContentBenchmark/)
  assert.match(benchmark, /evaluateDraft/)
  assert.match(benchmark, /good_caption_samples/)
  assert.match(benchmark, /bad_caption_samples/)
  assert.match(benchmark, /recordSignal/)
  assert.match(evaluator, /BRAND MANIFESTO EVIDENCE/)
  assert.match(evaluator, /Approved real captions/)
  assert.match(evaluator, /Rejected \/ off-brand captions/)
})

test('benchmark summary converts profile scores into a clear verdict', () => {
  assert.deepEqual(
    getBenchmarkSummary({
      voice_match: 5,
      dialect_fidelity: 4,
      humor_strength: 4,
      specificity: 5,
      originality: 4,
      ai_smell: 5,
    }),
    {
      average: 4.5,
      percentage: 90,
      verdict: 'Strong brand match',
      tone: 'strong',
    },
  )
})

test('training examples are trimmed and deduplicated', () => {
  assert.deepEqual(
    addUniqueSample(['Existing post'], '  A new Noch post  '),
    ['Existing post', 'A new Noch post'],
  )
  assert.deepEqual(
    addUniqueSample(['Existing post'], 'existing POST'),
    ['Existing post'],
  )
})
