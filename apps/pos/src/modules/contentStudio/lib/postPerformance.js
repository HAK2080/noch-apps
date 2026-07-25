const MANIFESTO_DIMENSIONS = [
  'voice_match',
  'dialect_fidelity',
  'humor_strength',
  'specificity',
  'originality',
  'ai_smell',
]

const RATING_FIELDS = ['hook_rating', 'creative_rating', 'business_impact_rating']
const METRIC_FIELDS = [
  'perf_reach',
  'perf_impressions',
  'perf_views',
  'perf_likes',
  'perf_comments',
  'perf_shares',
  'perf_saves',
  'perf_profile_visits',
  'perf_link_clicks',
  'perf_orders_before',
  'perf_orders_after',
  'perf_loyalty_visits_after',
]

function number(value) {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function round(value, precision = 1) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function average(values) {
  const valid = values.filter(Number.isFinite)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function median(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!valid.length) return null
  const middle = Math.floor(valid.length / 2)
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2
}

function weightedAverage(parts) {
  const available = parts.filter(part => Number.isFinite(part.score))
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0)
  if (!totalWeight) return null
  return available.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight
}

export function calculateEngagementRate(item = {}) {
  const views = number(item.perf_reach) ?? number(item.perf_views) ?? number(item.perf_impressions)
  if (!Number.isFinite(views) || views <= 0) return null
  const interactions = [
    item.perf_likes,
    item.perf_comments,
    item.perf_shares,
    item.perf_saves,
  ].map(value => number(value) ?? 0).reduce((sum, value) => sum + value, 0)
  return round((interactions / views) * 100, 2)
}

export function hasPerformanceData(item = {}) {
  return METRIC_FIELDS.some(field => number(item[field]) != null)
    || RATING_FIELDS.some(field => number(item[field]) != null)
    || number(item.perf_effectiveness_score) != null
    || Boolean(item.perf_evaluated_at)
}

export function buildPerformanceBenchmarks(items = [], currentItem = null) {
  const platform = currentItem?.perf_platform || currentItem?.platform || ''
  const comparable = items.filter(item => {
    if (item.id && currentItem?.id && item.id === currentItem.id) return false
    if (!hasPerformanceData(item)) return false
    const itemPlatform = item.perf_platform || item.platform || ''
    return !platform || !itemPlatform || itemPlatform === platform
  })

  const reaches = comparable.map(item =>
    number(item.perf_reach) ?? number(item.perf_views) ?? number(item.perf_impressions))
  const engagementRates = comparable.map(calculateEngagementRate)
  const effectivenessScores = comparable.map(item => number(item.perf_effectiveness_score))

  return {
    sampleSize: comparable.length,
    medianReach: median(reaches),
    averageReach: average(reaches),
    averageEngagementRate: average(engagementRates),
    averageEffectivenessScore: average(effectivenessScores),
  }
}

export function calculateManifestoScore(evaluation) {
  const scores = evaluation?.scores || {}
  const values = MANIFESTO_DIMENSIONS.map(key => number(scores[key])).filter(Number.isFinite)
  return values.length ? round((average(values) / 5) * 100) : null
}

function verdictFor(score) {
  if (!Number.isFinite(score)) return 'Not evaluated'
  if (score >= 80) return 'Excellent'
  if (score >= 65) return 'Strong'
  if (score >= 50) return 'Mixed'
  return 'Weak'
}

export function evaluatePostEffectiveness({
  item = {},
  peers = [],
  manifestoEvaluation = null,
} = {}) {
  const benchmarks = buildPerformanceBenchmarks(peers, item)
  const engagementRate = calculateEngagementRate(item)
  const reach = number(item.perf_reach) ?? number(item.perf_views) ?? number(item.perf_impressions)
  const profileVisits = number(item.perf_profile_visits)
  const ordersBefore = number(item.perf_orders_before)
  const ordersAfter = number(item.perf_orders_after)
  const ratings = RATING_FIELDS.map(field => number(item[field])).filter(Number.isFinite)

  const engagementBenchmark = Number.isFinite(benchmarks.averageEngagementRate)
    && benchmarks.averageEngagementRate > 0
    ? benchmarks.averageEngagementRate
    : 5
  const engagementScore = Number.isFinite(engagementRate)
    ? clamp((engagementRate / engagementBenchmark) * 70)
    : null

  const reachScore = Number.isFinite(reach)
    && reach > 0
    && Number.isFinite(benchmarks.medianReach)
    && benchmarks.medianReach > 0
    ? clamp((reach / benchmarks.medianReach) * 70)
    : null

  const profileVisitRate = Number.isFinite(profileVisits)
    && Number.isFinite(reach)
    && reach > 0
    ? (profileVisits / reach) * 100
    : null
  const profileVisitScore = Number.isFinite(profileVisitRate)
    ? clamp((profileVisitRate / 3) * 70)
    : null

  let orderLift = null
  if (Number.isFinite(ordersBefore) && Number.isFinite(ordersAfter)) {
    orderLift = ordersBefore > 0
      ? ((ordersAfter - ordersBefore) / ordersBefore) * 100
      : ordersAfter > 0 ? 100 : 0
  }
  const orderLiftScore = Number.isFinite(orderLift)
    ? clamp(50 + orderLift * 2.5)
    : null

  const ratingScore = ratings.length ? (average(ratings) / 5) * 100 : null
  const components = [
    { key: 'engagement', label: 'Engagement', score: engagementScore, weight: 0.4 },
    { key: 'reach', label: 'Reach vs average', score: reachScore, weight: 0.15 },
    { key: 'profile_visits', label: 'Profile visits', score: profileVisitScore, weight: 0.1 },
    { key: 'business_lift', label: 'Orders lift', score: orderLiftScore, weight: 0.2 },
    { key: 'ratings', label: 'Human ratings', score: ratingScore, weight: 0.15 },
  ].map(component => ({
    ...component,
    score: Number.isFinite(component.score) ? round(component.score) : null,
  }))

  const performanceScoreRaw = weightedAverage(components)
  const performanceScore = Number.isFinite(performanceScoreRaw) ? Math.round(performanceScoreRaw) : null
  const manifestoScore = calculateManifestoScore(manifestoEvaluation)
  let effectivenessScore = null
  if (Number.isFinite(performanceScore) && Number.isFinite(manifestoScore)) {
    effectivenessScore = Math.round(performanceScore * 0.65 + manifestoScore * 0.35)
  } else if (Number.isFinite(performanceScore)) {
    effectivenessScore = performanceScore
  } else if (Number.isFinite(manifestoScore)) {
    effectivenessScore = manifestoScore
  }

  const strengths = []
  const risks = []
  if (Number.isFinite(engagementRate)) {
    if (engagementRate >= engagementBenchmark * 1.2) strengths.push('Engagement is above the current Noch benchmark.')
    else if (engagementRate < engagementBenchmark * 0.75) risks.push('Engagement is below the current Noch benchmark.')
  }
  if (Number.isFinite(orderLift)) {
    if (orderLift >= 15) strengths.push(`Orders increased ${Math.round(orderLift)}% after publishing.`)
    else if (orderLift <= -15) risks.push(`Orders decreased ${Math.abs(Math.round(orderLift))}% after publishing.`)
  }
  if (Number.isFinite(manifestoScore)) {
    if (manifestoScore >= 80) strengths.push('The post is a strong match for the Noch manifesto.')
    else if (manifestoScore < 55) risks.push('The post is not a strong match for the Noch manifesto.')
  }
  if (number(item.hook_rating) >= 4) strengths.push('The hook was rated strong.')
  if (number(item.hook_rating) != null && number(item.hook_rating) <= 2) risks.push('The hook needs improvement.')

  const confidence = Number.isFinite(performanceScore) && Number.isFinite(manifestoScore)
    ? 'complete'
    : Number.isFinite(performanceScore) ? 'performance_only'
    : Number.isFinite(manifestoScore) ? 'creative_only'
    : 'insufficient_data'

  return {
    effectivenessScore,
    performanceScore,
    manifestoScore,
    verdict: verdictFor(effectivenessScore),
    confidence,
    engagementRate,
    engagementBenchmark: round(engagementBenchmark, 2),
    profileVisitRate: Number.isFinite(profileVisitRate) ? round(profileVisitRate, 2) : null,
    orderLift: Number.isFinite(orderLift) ? round(orderLift, 1) : null,
    components,
    benchmarks,
    strengths,
    risks,
  }
}

export function derivePerformanceSignalTypes(report = {}) {
  const signals = []
  if (report.effectivenessScore >= 80) signals.push('high_performing_content')
  if (Number.isFinite(report.effectivenessScore) && report.effectivenessScore < 45) signals.push('low_performing_content')
  if (report.manifestoScore >= 80) signals.push('brand_aligned')
  if (Number.isFinite(report.manifestoScore) && report.manifestoScore < 55) signals.push('off_brand')
  if (report.orderLift >= 15) signals.push('strong_product_push')
  if (Number.isFinite(report.orderLift) && report.orderLift <= -15) signals.push('weak_product_push')
  if (report.components?.find(component => component.key === 'engagement')?.score >= 80) signals.push('high_engagement')
  return signals
}

export function summarizePostPerformance(items = []) {
  const tracked = items.filter(hasPerformanceData)
  const scores = tracked.map(item => number(item.perf_effectiveness_score)).filter(Number.isFinite)
  const engagementRates = tracked.map(calculateEngagementRate).filter(Number.isFinite)
  const top = tracked
    .filter(item => number(item.perf_effectiveness_score) != null)
    .sort((a, b) => number(b.perf_effectiveness_score) - number(a.perf_effectiveness_score))[0] || null
  return {
    total: items.length,
    tracked: tracked.length,
    evaluated: scores.length,
    averageEffectiveness: scores.length ? Math.round(average(scores)) : null,
    averageEngagementRate: engagementRates.length ? round(average(engagementRates), 2) : null,
    top,
  }
}
