/**
 * @file Content Studio domain typedefs (Noch 4.0).
 * JSDoc-only; no runtime cost. Import for editor IntelliSense.
 */

/**
 * @typedef {Object} Business
 * @property {string} id
 * @property {string} name
 * @property {string=} name_ar
 * @property {string=} slug
 * @property {string=} description
 * @property {string=} owner_id
 * @property {string} created_at
 * @property {string=} updated_at
 */

/**
 * @typedef {Object} BrandVoiceProfile
 * @property {string} id
 * @property {string} business_id
 * @property {string} name
 * @property {string=} tone
 * @property {string=} language
 * @property {string=} dialect
 * @property {1|2|3|4|5} formality
 * @property {1|2|3|4|5} humor_tolerance
 * @property {string=} cta_style
 * @property {string[]} audience_descriptors
 * @property {string[]} banned_phrases
 * @property {string[]} preferred_phrases
 * @property {string=} notes
 * @property {boolean} is_default
 */

/**
 * @typedef {'url'|'screenshot'|'pasted_text'|'note'} InspirationSource
 * @typedef {'new'|'reviewed'|'extracted'|'archived'} InspirationStatus
 *
 * @typedef {Object} Inspiration
 * @property {string} id
 * @property {string} business_id
 * @property {InspirationSource} source_type
 * @property {string=} source_url
 * @property {string=} source_text
 * @property {string=} screenshot_path
 * @property {string=} preview_image_url
 * @property {string=} title
 * @property {string=} platform
 * @property {string=} content_pillar
 * @property {string=} seasonality
 * @property {string[]} tags
 * @property {InspirationStatus} status
 */

/**
 * @typedef {Object} ExtractedConcept
 * @property {string} id
 * @property {string} inspiration_id
 * @property {string=} hook_summary
 * @property {string=} content_pattern
 * @property {string=} emotional_driver
 * @property {string=} target_audience
 * @property {string=} why_it_works
 * @property {string=} reusable_mechanism
 * @property {'low'|'med'|'high'=} originality_risk
 * @property {string=} notes
 * @property {'draft'|'ready'|'archived'} status
 * @property {boolean} edited_by_user
 */

/**
 * @typedef {'short_post'|'caption'|'reel_hook'|'carousel_outline'|'story'} DraftFormat
 * @typedef {'generated'|'edited'|'approved'|'rejected'|'archived'} DraftStatus
 *
 * @typedef {Object} DraftVariant
 * @property {string} id
 * @property {string} concept_id
 * @property {string} brand_voice_profile_id
 * @property {string=} platform
 * @property {DraftFormat} format
 * @property {string} body_text
 * @property {string=} hook
 * @property {string=} cta
 * @property {string[]} hashtags
 * @property {Object} generation_params
 * @property {string=} parent_draft_id
 * @property {'ai'|'human'|'rewrite'} source
 * @property {DraftStatus} status
 */

/**
 * @typedef {Object} DraftEvaluation
 * @property {string} id
 * @property {string} draft_id
 * @property {{clarity?:number, brand_fit?:number, dialect_authenticity?:number,
 *   specificity?:number, cringe_risk?:number, ai_sounding_risk?:number}} scores
 * @property {string[]} labels
 * @property {Object} explanations
 * @property {string} evaluator_version
 */

/**
 * @typedef {Object} UserEdit
 * @property {string} id
 * @property {string} draft_id
 * @property {string=} before_text
 * @property {string=} after_text
 * @property {Object} diff
 * @property {string[]} classification
 */

/**
 * @typedef {Object} LearningSignal
 * @property {string} id
 * @property {string} business_id
 * @property {string=} brand_voice_profile_id
 * @property {'approved'|'rejected'|'edit'|'evaluator_flag'|'rewrite'} signal_type
 * @property {string=} source_table
 * @property {string=} source_id
 * @property {Object} payload
 */

/**
 * @typedef {Object} ContentBankItem
 * @property {string} id
 * @property {string} business_id
 * @property {string=} brand_voice_profile_id
 * @property {string=} draft_id
 * @property {string=} concept_id
 * @property {string=} inspiration_id
 * @property {string=} format
 * @property {string=} platform
 * @property {string=} content_pillar
 * @property {string=} seasonality
 * @property {string} final_text
 * @property {string[]} hashtags
 * @property {string[]} tags
 * @property {'approved'|'archived'} status
 */

/**
 * @typedef {Object} CreativeBrief
 * @property {string} id
 * @property {string} content_bank_item_id
 * @property {string=} prompt_text
 * @property {string=} style_notes
 * @property {Object} refs
 * @property {'draft'|'ready'|'used'} status
 */

export {}
