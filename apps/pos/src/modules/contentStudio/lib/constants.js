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

// ─── Phase 0 — Intelligence Foundation ────────────────────────────────
// Shared, deterministic vocabulary every later phase reuses. Keep these
// short — they show up in selects, signal cards, and AI prompts.

// Why are we publishing? Every brief and draft picks one mission so the
// rest of the pipeline knows what success looks like.
export const MISSIONS = [
  { id: 'sell_product',       label: 'Sell Product',          desc: 'Move a specific drink/item this week' },
  { id: 'bring_back',         label: 'Bring Back Customers',  desc: 'Re-engage lapsed regulars' },
  { id: 'cult_feeling',       label: 'Build Cult Feeling',    desc: 'Insider energy, in-jokes, repetition' },
  { id: 'educate',            label: 'Educate / Explain',     desc: 'Answer the same question a tenth time' },
  { id: 'create_ugc',         label: 'Create UGC',            desc: 'Hand the camera to customers' },
  { id: 'humanize',           label: 'Humanize Noch',         desc: 'Show the people, not the polish' },
]

// Nochi voice — short principles the prompts and the editor lean on.
export const VOICE_RULES = [
  'Playful but premium — never juvenile, never sterile',
  'Local but not cheap — Tripoli pride without the kitsch',
  'Funny but not cringe — punchline lands fast or not at all',
  'Emotional but not needy — confident regular, not desperate brand',
  'Rebellious but cafe-safe — flirts with edges, never sells out values',
  'Libyan Arabic when casual; English/Arabic hybrid when product-led',
  'No generic influencer caption language',
  'No corporate wording, no fake slang',
  'Warm, witty, slightly unhinged — but always intentional',
]

// How risky is this adaptation vs. its source?
export const COPY_RISK_LEVELS = [
  { id: 'safe_remix',           label: 'Safe Remix',           tone: 'green',
    desc: 'Mechanism reused, surface fully reimagined for Noch' },
  { id: 'close_adaptation',     label: 'Close Adaptation',     tone: 'amber',
    desc: 'Same structure as source; execution is different but recognisable' },
  { id: 'dangerously_similar',  label: 'Dangerously Similar',  tone: 'red',
    desc: 'Visually or textually too close to source — needs rework before publish' },
]

// Nochi-specific formats. These are voice-driven content shapes — they
// describe the angle, not the platform. Pair with FORMATS (post/reel/etc).
export const NOCHI_FORMATS = [
  { id: 'nochi_confession',  label: 'Nochi Confession',  desc: 'First-person Nochi admits something' },
  { id: 'rescue_mission',    label: 'Rescue Mission',    desc: 'Nochi sees a customer in need, intervenes' },
  { id: 'regulars_club',     label: 'Regulars Club',     desc: 'Inside-baseball for repeat customers' },
  { id: 'counter_talk',      label: 'Counter Talk',      desc: 'Verbatim quote from the counter' },
  { id: 'drink_drama',       label: 'Drink Drama',       desc: 'Mini-soap-opera around a single drink' },
  { id: 'staff_pov',         label: 'Staff POV',         desc: 'Barista or supervisor narrates' },
  { id: 'tripoli_mood',      label: 'Tripoli Mood',      desc: 'Local moment, weather, street, smell' },
  { id: 'tiny_rebellion',    label: 'Tiny Rebellion',    desc: 'A small no — ritual against industry norms' },
  { id: 'product_ritual',    label: 'Product Ritual',    desc: 'How regulars order — the magic phrase' },
  { id: 'behind_the_bar',    label: 'Behind the Bar',    desc: 'Process, hands, mistakes, repair' },
]

// Brief quality sub-scores. The DB has q_objective_clarity, q_audience_clarity,
// q_nochi_fit, q_local_relevance, q_business_value, q_execution_simplicity
// (added by 20260509130000_content_studio_phases_2_to_7.sql).
export const BRIEF_QUALITY_FIELDS = [
  { id: 'objective_clarity',     label: 'Objective clarity',      column: 'q_objective_clarity' },
  { id: 'audience_clarity',      label: 'Audience clarity',       column: 'q_audience_clarity' },
  { id: 'nochi_fit',             label: 'Nochi fit',              column: 'q_nochi_fit' },
  { id: 'local_relevance',       label: 'Local relevance',        column: 'q_local_relevance' },
  { id: 'business_value',        label: 'Business value',         column: 'q_business_value' },
  { id: 'execution_simplicity',  label: 'Execution simplicity',   column: 'q_execution_simplicity' },
]

// When staff capture an idea/observation, this maps the *kind* of thing
// they captured to a starting mission + format the brief should default
// to. Used by the Ideas → Brief bridge and signal-driven brief creation.
export const LOCAL_CAPTURE_MAPPING = {
  customer_phrase:      { mission: 'cult_feeling',  format: 'nochi_confession' },
  funny_moment:         { mission: 'humanize',      format: 'counter_talk' },
  staff_observation:    { mission: 'humanize',      format: 'staff_pov' },
  repeated_question:    { mission: 'educate',       format: 'product_ritual' },
  product_reaction:     { mission: 'sell_product',  format: 'drink_drama' },
  local_tripoli_moment: { mission: 'cult_feeling',  format: 'tripoli_mood' },
  service_issue:        { mission: 'humanize',      format: 'behind_the_bar' },
  feedback_quote:       { mission: 'bring_back',    format: 'counter_talk' },
}

// Short bank of seed examples the editor and prompts can reach for. Not
// canonical content — just enough to anchor what "good Nochi" feels like
// across the missions/formats matrix.
export const SEED_EXAMPLES = [
  // Sell product / drink drama
  { mission: 'sell_product', format: 'drink_drama',
    note: 'Iced matcha vs. iced latte — the one summer week the matcha won.' },
  { mission: 'sell_product', format: 'product_ritual',
    note: 'How regulars say "the usual" — the 4 phrases that mean the same drink.' },
  // Bring back / counter talk
  { mission: 'bring_back', format: 'counter_talk',
    note: 'Customer who hadn\'t come in 3 weeks: "I missed the chair more than the coffee."' },
  { mission: 'bring_back', format: 'nochi_confession',
    note: 'Nochi admits the cafe has been quieter without [name] — soft return ask.' },
  // Cult feeling / regulars club
  { mission: 'cult_feeling', format: 'regulars_club',
    note: 'Glossary post: 8 things only regulars know (chair, password, side-door rule).' },
  { mission: 'cult_feeling', format: 'tiny_rebellion',
    note: '"We don\'t do pumpkin spice" — soft no, hard pride.' },
  // Educate / product ritual
  { mission: 'educate', format: 'product_ritual',
    note: 'Why our matcha is unsweet by default — 60-sec myth-bust, no condescension.' },
  { mission: 'educate', format: 'behind_the_bar',
    note: 'Espresso shot pulled in real time — narrate what the barista is fixing.' },
  // UGC / rescue mission
  { mission: 'create_ugc', format: 'rescue_mission',
    note: 'Bring your worst breakup story — drink on us — share if you\'re brave.' },
  { mission: 'create_ugc', format: 'tripoli_mood',
    note: 'Tag your favourite Tripoli view — best three get featured + a free week.' },
  // Humanize / staff POV
  { mission: 'humanize', format: 'staff_pov',
    note: '"Things customers say to me at 8am" — Selma narrates 30 seconds straight.' },
  { mission: 'humanize', format: 'behind_the_bar',
    note: 'The first cup of the day, the apron, the silence before opening.' },
  // Local / Tripoli mood
  { mission: 'cult_feeling', format: 'tripoli_mood',
    note: 'Friday afternoon Tripoli — empty streets, full cafes, the slow hour.' },
  // Mechanism-driven examples (for inspiration adaptation)
  { mission: 'sell_product', format: 'counter_talk',
    note: 'Mechanism: overheard quote → product reveal. Adapt to a Noch drink.' },
  { mission: 'cult_feeling', format: 'regulars_club',
    note: 'Mechanism: brand glossary as in-joke. Adapt 8 Noch terms only insiders know.' },
  // Bilingual / hybrid
  { mission: 'sell_product', format: 'drink_drama',
    note: 'Hybrid Arabic/English — caption in Libyan, drink name in English. Test format.' },
  { mission: 'bring_back', format: 'nochi_confession',
    note: 'Pure Libyan caption from Nochi to a single named regular. WhatsApp-style.' },
  { mission: 'humanize', format: 'tiny_rebellion',
    note: 'A small "we don\'t do X" — mention it once, never again. Brand spine.' },
]
