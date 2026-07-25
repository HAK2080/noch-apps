import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  extractEvaluationJson,
  generateParsedEvaluation,
} from '../../../supabase/functions/_shared/evaluationJson.ts'

const validEvaluation = JSON.stringify({
  scores: {
    voice_match: 5,
    dialect_fidelity: 3,
    humor_strength: 5,
    specificity: 5,
    originality: 4,
    ai_smell: 5,
  },
  labels: ['dialect_uncertain'],
  explanations: {
    dialect_uncertain: 'The dialect needs a stronger Tripoli marker.',
  },
})

test('accepts schema JSON wrapped in a markdown fence', () => {
  const parsed = extractEvaluationJson(`\`\`\`json\n${validEvaluation}\n\`\`\``)
  assert.equal(parsed.scores.voice_match, 5)
})

test('repairs a missing comma between evaluation properties', async () => {
  let calls = 0
  const result = await generateParsedEvaluation(async () => {
    calls += 1
    return {
      model: 'gemini-2.5-flash',
      text: '{"scores":{"voice_match":5 "dialect_fidelity":3}}',
    }
  }, 'evaluate this post')

  assert.equal(calls, 1)
  assert.equal(result.parsed.scores.voice_match, 5)
  assert.equal(result.parsed.scores.dialect_fidelity, 3)
})

test('retries once when malformed evaluation JSON cannot be repaired safely', async () => {
  let calls = 0
  const result = await generateParsedEvaluation(async () => {
    calls += 1
    return {
      model: 'gemini-2.5-flash',
      text: calls === 1 ? '{"scores":' : validEvaluation,
    }
  }, 'evaluate this post')

  assert.equal(calls, 2)
  assert.equal(result.parsed.scores.voice_match, 5)
})

test('content evaluator includes the configured OpenAI structured-output fallback', async () => {
  const source = await readFile(
    new URL('../../../supabase/functions/cs-evaluate-draft/index.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /Deno\.env\.get\("Openai_API_KEY"\)/)
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/chat\/completions/)
  assert.match(source, /response_format:\s*\{\s*type:\s*"json_schema"/)
  assert.ok(source.indexOf('if (geminiKey)') < source.indexOf('if (openaiKey)'))
})
