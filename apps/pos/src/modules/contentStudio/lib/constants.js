// Content Studio constants — Noch 4.0

export const FORMATS = [
  { id: 'short_post', label: 'Short post' },
  { id: 'caption', label: 'Caption' },
  { id: 'reel_hook', label: 'Reel/script hook' },
  { id: 'carousel_outline', label: 'Carousel outline' },
  { id: 'story', label: 'Story text' },
]

export const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'twitter', label: 'X / Twitter' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'web', label: 'Web' },
]

export const INSPIRATION_SOURCE_TYPES = [
  { id: 'url', label: 'URL' },
  { id: 'screenshot', label: 'Screenshot' },
  { id: 'pasted_text', label: 'Pasted text' },
  { id: 'note', label: 'Manual note' },
]

export const INSPIRATION_STATUSES = ['new', 'reviewed', 'extracted', 'archived']
export const DRAFT_STATUSES = ['generated', 'edited', 'approved', 'has_potential', 'rejected', 'archived']

export const USE_LIKELIHOOD_LABELS = {
  0: "Won't use",
  1: 'Needs heavy work',
  2: 'Has potential',
  3: 'Post with edits',
  4: 'Post as-is',
}

export const EVALUATOR_LABELS = {
  // legacy — kept for back-compat with existing rows
  safe:               { label: 'Safe',                tone: 'green' },
  needs_review:       { label: 'Needs review',        tone: 'amber' },
  off_brand:          { label: 'Off-brand',           tone: 'red' },
  humor_weak:         { label: 'Humor weak',          tone: 'grey' },
  dialect_uncertain:  { label: 'Dialect uncertain',   tone: 'grey' },
  // Phase 5 — Libyan/Nochi-aware evaluator labels
  too_msa:            { label: 'Too MSA',             tone: 'red' },
  too_gulf:           { label: 'Too Gulf',            tone: 'red' },
  too_egyptian:       { label: 'Too Egyptian',        tone: 'red' },
  fake_slang:         { label: 'Fake slang',          tone: 'red' },
  too_salesy:         { label: 'Too salesy',          tone: 'red' },
  not_nochi:          { label: 'Not Nochi',           tone: 'red' },
  too_cringe:         { label: 'Too cringe',          tone: 'red' },
  too_generic:        { label: 'Too generic',         tone: 'red' },
  sounds_ai:          { label: 'Sounds AI',           tone: 'red' },
  weak_hook:          { label: 'Weak hook',           tone: 'amber' },
  good_to_post:       { label: 'Good to post',        tone: 'green' },
}

// Phase 5 — voice/quality sub-scores rendered by the draft inspector.
export const VOICE_SCORE_FIELDS = [
  { id: 'libyan_naturalness_score',      label: 'Libyan naturalness' },
  { id: 'nochi_voice_fit_score',         label: 'Nochi voice fit' },
  { id: 'human_score',                   label: 'Human (not AI)' },
  { id: 'sales_pressure_score',          label: 'Sales pressure (low = soft)' },
  { id: 'joke_quality_score',            label: 'Joke quality' },
  { id: 'dialect_risk_score',            label: 'Dialect risk (low = safe)' },
  { id: 'premium_playful_balance_score', label: 'Premium ↔ playful balance' },
]

export const REWRITE_ACTIONS = [
  // Phase 5 — sharper Libyan/Nochi-aware rewrites
  { id: 'more_libyan',          label: 'Make more Libyan' },
  { id: 'less_gulf_egyptian',   label: 'Make less Gulf/Egyptian' },
  { id: 'more_nochi',           label: 'Make more Nochi' },
  { id: 'less_ai',              label: 'Make less AI' },
  { id: 'more_tripoli',         label: 'Make more Tripoli' },
  { id: 'softer_cta',           label: 'Make softer CTA' },
  { id: 'more_chaotic',         label: 'Make more chaotic' },
  { id: 'more_premium',         label: 'Make more premium' },
  { id: 'more_customer_sounding', label: 'Make more customer-sounding' },
  { id: 'sharper_hook',         label: 'Make the hook sharper' },
  { id: 'shorter',              label: 'Make it shorter' },
  { id: 'less_cringe',          label: 'Make it less cringe' },
  // legacy — keep for any in-flight UIs that still reference these
  { id: 'stronger_hook',    label: 'Stronger hook' },
  { id: 'less_salesy',      label: 'Less salesy' },
  { id: 'more_dialect',     label: 'More local dialect' },
  { id: 'remove_joke',      label: 'Remove joke' },
  { id: 'simplify',         label: 'Simplify wording' },
  { id: 'more_natural',     label: 'Sound more natural' },
  { id: 'reduce_slang',     label: 'Reduce slang' },
  { id: 'add_specificity',  label: 'Add specificity' },
  { id: 'more_human',       label: 'More human' },
]

export const EDIT_CLASSIFICATIONS = [
  'tone_fix','clarity_fix','dialect_fix','brand_mismatch',
  'wording_simplification','humor_removal','cta_change',
]

export const SUB_NAV = [
  { to: '/content-studio',              label: 'Overview',     end: true },
  { to: '/content-studio/businesses',   label: 'Businesses' },
  { to: '/content-studio/signals',      label: 'Signals' },
  { to: '/content-studio/inspiration',  label: 'Inspiration' },
  { to: '/content-studio/concepts',     label: 'Concepts' },
  { to: '/content-studio/briefs',       label: 'Briefs' },
  { to: '/content-studio/campaigns',    label: 'Campaigns' },
  { to: '/content-studio/drafts',       label: 'Drafts' },
  { to: '/content-studio/voice-lab',       label: 'Voice Lab' },
  { to: '/content-studio/dialect-trainer', label: 'Dialect Trainer' },
  { to: '/content-studio/bank',            label: 'Content Bank' },
  { to: '/content-studio/settings',     label: 'Settings' },
]

export const SELECTED_BUSINESS_KEY = 'cs_selected_business_id'
