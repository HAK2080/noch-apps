export const BENCHMARK_DIMENSIONS = [
  { key: 'voice_match', label: 'Voice match' },
  { key: 'dialect_fidelity', label: 'Dialect fidelity' },
  { key: 'humor_strength', label: 'Humor strength' },
  { key: 'specificity', label: 'Brand specificity' },
  { key: 'originality', label: 'Originality' },
  { key: 'ai_smell', label: 'Human feel' },
]

export function getBenchmarkSummary(scores = {}) {
  const values = BENCHMARK_DIMENSIONS
    .map(({ key }) => Number(scores[key]))
    .filter(Number.isFinite)
    .map(value => Math.max(1, Math.min(5, value)))
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0
  const percentage = Math.round((average / 5) * 100)

  if (percentage >= 80) {
    return { average, percentage, verdict: 'Strong brand match', tone: 'strong' }
  }
  if (percentage >= 60) {
    return { average, percentage, verdict: 'Needs refinement', tone: 'review' }
  }
  return { average, percentage, verdict: 'Off-brand', tone: 'weak' }
}

export function addUniqueSample(samples, content) {
  const normalized = String(content || '').trim()
  if (!normalized) return Array.isArray(samples) ? samples : []
  const existing = Array.isArray(samples) ? samples.filter(Boolean) : []
  if (existing.some(sample => sample.trim().toLowerCase() === normalized.toLowerCase())) {
    return existing
  }
  return [...existing, normalized]
}
