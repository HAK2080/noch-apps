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
export const DRAFT_STATUSES = ['generated', 'edited', 'approved', 'rejected', 'archived']

export const EVALUATOR_LABELS = {
  safe:               { label: 'Safe',                tone: 'green' },
  needs_review:       { label: 'Needs review',        tone: 'amber' },
  too_generic:        { label: 'Too generic',         tone: 'red' },
  off_brand:          { label: 'Off-brand',           tone: 'red' },
  sounds_ai:          { label: 'Sounds AI-generated', tone: 'red' },
  humor_weak:         { label: 'Humor weak',          tone: 'grey' },
  dialect_uncertain:  { label: 'Dialect uncertain',   tone: 'grey' },
}

export const REWRITE_ACTIONS = [
  { id: 'shorter',          label: 'Shorter' },
  { id: 'stronger_hook',    label: 'Stronger hook' },
  { id: 'less_salesy',      label: 'Less salesy' },
  { id: 'more_casual',      label: 'More casual' },
  { id: 'more_dialect',     label: 'More local dialect' },
  { id: 'remove_joke',      label: 'Remove joke' },
  { id: 'more_direct',      label: 'More direct' },
  { id: 'more_polished',    label: 'More polished' },
  { id: 'simplify',         label: 'Simplify wording' },
  { id: 'more_natural',     label: 'Sound more natural' },
  { id: 'remove_corporate', label: 'Remove corporate phrasing' },
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
  { to: '/content-studio/inspiration',  label: 'Inspiration' },
  { to: '/content-studio/concepts',     label: 'Concepts' },
  { to: '/content-studio/drafts',       label: 'Drafts' },
  { to: '/content-studio/voice-lab',    label: 'Voice Lab' },
  { to: '/content-studio/bank',         label: 'Content Bank' },
  { to: '/content-studio/settings',     label: 'Settings' },
]

export const SELECTED_BUSINESS_KEY = 'cs_selected_business_id'
