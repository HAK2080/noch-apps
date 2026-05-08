export const QUALITY_LABELS = { 1: 'Thin', 2: 'Fair', 3: 'Good', 4: 'Strong', 5: 'Sharp' }

export const QUALITY_COLORS = {
  1: 'text-red-400',
  2: 'text-amber-400',
  3: 'text-yellow-300',
  4: 'text-noch-green',
  5: 'text-noch-green',
}

export const QUALITY_BG = {
  1: 'bg-red-500/10',
  2: 'bg-amber-500/10',
  3: 'bg-yellow-500/10',
  4: 'bg-noch-green/10',
  5: 'bg-noch-green/15',
}

/**
 * Auto-calculates a 1–5 concept quality score based on field richness.
 * Does NOT modify the concept object.
 */
export function calculateConceptQuality(concept) {
  if (!concept) return 1
  let pts = 0

  const len = (f) => (typeof concept[f] === 'string' ? concept[f].trim().length : 0)

  // Hook richness
  if (len('hook_summary') >= 30) pts += 15

  // Why it works depth
  if (len('why_it_works') >= 100) pts += 20
  else if (len('why_it_works') >= 50) pts += 10

  // Reusable mechanism specificity
  if (len('reusable_mechanism') >= 50) pts += 20
  else if (len('reusable_mechanism') >= 20) pts += 10

  // Joke structure is a strong signal — means humor mechanics were extracted
  if (len('joke_structure') > 10) pts += 10

  // Emotional driver
  if (len('emotional_driver') > 0) pts += 10

  // Target audience specificity
  if (len('target_audience') >= 20) pts += 10
  else if (len('target_audience') > 0) pts += 5

  // Categorical fields
  if (concept.post_nature) pts += 5
  if (concept.voice_type) pts += 5

  // Originality risk deductions
  const risk = (concept.originality_risk || '').toLowerCase()
  if (risk.includes('overused')) pts -= 20
  else if (risk.includes('high')) pts -= 15
  else if (risk.includes('medium')) pts -= 10

  pts = Math.max(0, Math.min(100, pts))

  if (pts >= 80) return 5
  if (pts >= 60) return 4
  if (pts >= 40) return 3
  if (pts >= 20) return 2
  return 1
}
