import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildPerformanceBenchmarks,
  calculateEngagementRate,
  derivePerformanceSignalTypes,
  evaluatePostEffectiveness,
  summarizePostPerformance,
} from '../src/modules/contentStudio/lib/postPerformance.js'

const manifesto = {
  scores: {
    voice_match: 5,
    dialect_fidelity: 4,
    humor_strength: 4,
    specificity: 5,
    originality: 4,
    ai_smell: 5,
  },
}

test('calculates standard engagement rate from recorded interactions', () => {
  assert.equal(calculateEngagementRate({
    perf_reach: 1000,
    perf_likes: 50,
    perf_comments: 10,
    perf_shares: 5,
    perf_saves: 15,
  }), 8)
})

test('evaluates a high-performing, brand-aligned post against Noch peers', () => {
  const peers = [
    { id: 'a', perf_platform: 'instagram', perf_reach: 1000, perf_likes: 40, perf_comments: 5, perf_shares: 5, perf_saves: 10 },
    { id: 'b', perf_platform: 'instagram', perf_reach: 1200, perf_likes: 50, perf_comments: 8, perf_shares: 4, perf_saves: 10 },
  ]
  const report = evaluatePostEffectiveness({
    item: {
      id: 'current',
      perf_platform: 'instagram',
      perf_reach: 2200,
      perf_likes: 160,
      perf_comments: 30,
      perf_shares: 35,
      perf_saves: 45,
      perf_profile_visits: 90,
      perf_orders_before: 100,
      perf_orders_after: 135,
      hook_rating: 5,
      creative_rating: 5,
      business_impact_rating: 5,
    },
    peers,
    manifestoEvaluation: manifesto,
  })

  assert.equal(report.confidence, 'complete')
  assert.ok(report.effectivenessScore >= 80)
  assert.equal(report.verdict, 'Excellent')
  assert.ok(report.strengths.some(value => value.includes('Orders increased')))
  assert.deepEqual(
    derivePerformanceSignalTypes(report).sort(),
    ['brand_aligned', 'high_engagement', 'high_performing_content', 'strong_product_push'].sort(),
  )
})

test('does not invent an effectiveness score when no evidence exists', () => {
  const report = evaluatePostEffectiveness({ item: {}, peers: [] })
  assert.equal(report.effectivenessScore, null)
  assert.equal(report.confidence, 'insufficient_data')
  assert.equal(report.verdict, 'Not evaluated')
})

test('builds platform-specific benchmarks and portfolio summary', () => {
  const rows = [
    { id: '1', perf_platform: 'instagram', perf_reach: 1000, perf_likes: 50, perf_effectiveness_score: 70 },
    { id: '2', perf_platform: 'instagram', perf_reach: 2000, perf_likes: 120, perf_effectiveness_score: 90 },
    { id: '3', perf_platform: 'facebook', perf_reach: 9000, perf_likes: 500, perf_effectiveness_score: 95 },
  ]

  const benchmark = buildPerformanceBenchmarks(rows, { id: 'current', perf_platform: 'instagram' })
  assert.equal(benchmark.sampleSize, 2)
  assert.equal(benchmark.medianReach, 1500)

  const summary = summarizePostPerformance(rows)
  assert.deepEqual(
    {
      total: summary.total,
      tracked: summary.tracked,
      evaluated: summary.evaluated,
      averageEffectiveness: summary.averageEffectiveness,
      top: summary.top.id,
    },
    { total: 3, tracked: 3, evaluated: 3, averageEffectiveness: 85, top: '3' },
  )
})

test('routes Content Studio measurement through one authoritative publication workflow', async () => {
  const [routes, nav, page, service, migration] = await Promise.all([
    readFile(new URL('../src/modules/contentStudio/index.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/contentStudio/lib/constants.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/contentStudio/pages/ContentMeasurement.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/contentStudio/services/measurement.js', import.meta.url), 'utf8'),
    readFile(
      new URL('../../../supabase/migrations/20260731234000_content_measurement_control.sql', import.meta.url),
      'utf8',
    ),
  ])

  assert.match(routes, /path="performance" element=\{<ContentMeasurement/)
  assert.match(nav, /\/content-studio\/performance/)
  assert.match(page, /Publishing & content measurement/)
  assert.match(page, /markPublished/)
  assert.match(page, /Performance snapshot/)
  assert.match(page, /does not claim lift or causality/)
  assert.match(service, /content_measurement_summary_v2/)
  assert.match(service, /cs_publications/)
  assert.match(service, /cs_performance_snapshots/)
  assert.match(migration, /create table if not exists public\.cs_publications/i)
  assert.match(migration, /create table if not exists public\.cs_performance_snapshots/i)
  assert.match(migration, /'causal_claims_allowed', false/i)
})
