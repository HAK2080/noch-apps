import { supabase } from '../../../lib/supabase'

async function callEdgeFunction(name, payload) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload })
  if (error) {
    if (error.context) {
      try {
        const body = await error.context.clone().json()
        const msg = body?.error || body?.message
        if (msg) throw new Error(msg)
      } catch (innerErr) {
        if (innerErr instanceof Error && innerErr !== error) throw innerErr
      }
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// ============================================================
// EDGE FUNCTION CALLERS
// ============================================================

export async function analyzeBrand(brand, materials) {
  // Cap at 20 materials to avoid timeouts — prioritize caption_examples and post_screenshots
  const prioritized = [
    ...materials.filter(m => m.type === 'caption_example' || m.type === 'post_example'),
    ...materials.filter(m => m.type === 'post_screenshot'),
    ...materials.filter(m => !['caption_example', 'post_example', 'post_screenshot'].includes(m.type)),
  ].slice(0, 20)
  return callEdgeFunction('analyze-brand', {
    brand,
    materials: prioritized,
    currentProgram: brand.brand_program || '',
  })
}

export async function autoResearch(brand, { mode, urls, topics }) {
  return callEdgeFunction('auto-research', { brand, mode, urls, topics })
}

export async function generateContent(brand, research, config, swipeEntries = [], batchSize = 1) {
  return callEdgeFunction('generate-content', {
    brand,
    research,
    config,
    swipeEntries,
    batchSize,
  })
}

export async function scoreVoice(brand, text) {
  return callEdgeFunction('analyze-brand', {
    brand,
    materials: [{ type: 'voice_check', content: text, title: 'Voice comparison input' }],
    currentProgram: brand.brand_program || '',
    mode: 'score_only',
  })
}

export async function analyzeBrandWithNegatives(brand, materials, negativeExamples = []) {
  const prioritized = [
    ...materials.filter(m => m.type === 'caption_example' || m.type === 'post_example'),
    ...materials.filter(m => m.type === 'post_screenshot'),
    ...materials.filter(m => !['caption_example', 'post_example', 'post_screenshot'].includes(m.type)),
  ].slice(0, 20)
  return callEdgeFunction('analyze-brand', {
    brand,
    materials: prioritized,
    currentProgram: brand.brand_program || '',
    negativeExamples,
  })
}

export async function webScout(brand) {
  return callEdgeFunction('auto-research', { brand, mode: 'web-scout' })
}

export async function scrapeSources(brand, sources, brandFingerprint) {
  return callEdgeFunction('social-scraper', {
    brand,
    sources,
    brand_fingerprint: brandFingerprint || brand.brand_program || '',
    mode: 'scrape',
  })
}

export async function discoverSources(brand, city) {
  return callEdgeFunction('social-scraper', { brand, mode: 'discover', city: city || 'tripoli' })
}

// ============================================================
// BRANDS
// ============================================================

export async function uploadBrandMaterial(brandId, file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `brands/${brandId}/materials/${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) throw uploadError
  const { data: urlData, error: urlError } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, 31536000)
  if (urlError) throw urlError
  return urlData.signedUrl
}

export async function getBrands() {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getBrand(id) {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createBrand(payload) {
  const { data, error } = await supabase
    .from('brands')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBrand(id, updates) {
  const { data, error } = await supabase
    .from('brands')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// BRAND MATERIALS
// ============================================================

export async function getBrandMaterials(brandId) {
  const { data, error } = await supabase
    .from('brand_materials')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createBrandMaterial(payload) {
  const { data, error } = await supabase
    .from('brand_materials')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteBrandMaterial(id) {
  const { error } = await supabase
    .from('brand_materials')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// RESEARCH
// ============================================================

export async function getContentResearch(brandId, filters = {}) {
  let query = supabase
    .from('content_research')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.source_platform) query = query.eq('source_platform', filters.source_platform)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getResearch(id) {
  const { data, error } = await supabase
    .from('content_research')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createResearch(payload) {
  const { data, error } = await supabase
    .from('content_research')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateResearch(id, updates) {
  const { data, error } = await supabase
    .from('content_research')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// POSTS
// ============================================================

export async function getContentPosts(brandId, filters = {}) {
  let query = supabase
    .from('content_posts')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.platform) query = query.eq('platform', filters.platform)
  if (filters.format) query = query.eq('format', filters.format)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getContentPost(id) {
  const { data, error } = await supabase
    .from('content_posts')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createContentPost(payload) {
  const { data, error } = await supabase
    .from('content_posts')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateContentPost(id, updates) {
  const { data, error } = await supabase
    .from('content_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteContentPost(id) {
  const { error } = await supabase
    .from('content_posts')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// CALENDAR
// ============================================================

export async function getContentCalendar(brandId) {
  const { data, error } = await supabase
    .from('content_calendar')
    .select('*, post:content_posts(*)')
    .eq('brand_id', brandId)
    .order('scheduled_at')
  if (error) throw error
  return data
}

export async function schedulePost(payload) {
  const { data, error } = await supabase
    .from('content_calendar')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// EXPERIMENTS
// ============================================================

export async function getContentExperiments(brandId) {
  const { data, error } = await supabase
    .from('content_experiments')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createExperiment(payload) {
  const { data, error } = await supabase
    .from('content_experiments')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// SWIPE FILE
// ============================================================

export async function getSwipeFile(brandId, filters = {}) {
  let query = supabase
    .from('swipe_file')
    .select('*')
    .eq('brand_id', brandId)
    .eq('is_archived', false)
    .order('voice_similarity_score', { ascending: false })
  if (filters.is_curated) query = query.eq('is_curated', true)
  if (filters.source_platform) query = query.eq('source_platform', filters.source_platform)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createSwipeEntry(payload) {
  const { data, error } = await supabase
    .from('swipe_file')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createSwipeEntries(entries) {
  const { data, error } = await supabase
    .from('swipe_file')
    .insert(entries)
    .select()
  if (error) throw error
  return data
}

export async function updateSwipeEntry(id, updates) {
  const { data, error } = await supabase
    .from('swipe_file')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// SCOUT SOURCES
// ============================================================

export async function getScoutSources(brandId) {
  const { data, error } = await supabase.from('scout_sources')
    .select('*').eq('brand_id', brandId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createScoutSource(payload) {
  const { data, error } = await supabase.from('scout_sources').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateScoutSource(id, updates) {
  const { data, error } = await supabase.from('scout_sources').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteScoutSource(id) {
  const { error } = await supabase.from('scout_sources').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// VOICE FINGERPRINT
// ============================================================

export async function getVoiceFingerprint(brandId) {
  const { data, error } = await supabase
    .from('voice_fingerprint')
    .select('*')
    .eq('brand_id', brandId)
    .order('dimension')
  if (error) throw error
  return data
}

export async function upsertVoiceFingerprint(brandId, dimension, data) {
  const { data: result, error } = await supabase
    .from('voice_fingerprint')
    .upsert({
      brand_id: brandId,
      dimension,
      score: data.score,
      confidence: data.confidence,
      evidence: data.evidence || null,
      source: data.source || 'auto',
      source_weight: data.source_weight ?? 1,
    }, { onConflict: 'brand_id,dimension' })
    .select()
    .single()
  if (error) throw error
  return result
}

// ============================================================
// DIALECT CORPUS
// ============================================================

export async function getDialectCorpus(brandId, filters = {}) {
  let query = supabase
    .from('dialect_corpus')
    .select('*')
    .eq('brand_id', brandId)
    .order('frequency', { ascending: false })
  if (filters.category) query = query.eq('category', filters.category)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function addDialectEntries(entries) {
  const { data, error } = await supabase
    .from('dialect_corpus')
    .insert(entries)
    .select()
  if (error) throw error
  return data
}

export async function updateDialectEntry(id, updates) {
  const { data, error } = await supabase
    .from('dialect_corpus')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// NEGATIVE EXAMPLES
// ============================================================

export async function getNegativeExamples(brandId) {
  const { data, error } = await supabase
    .from('negative_examples')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createNegativeExample(payload) {
  const { data, error } = await supabase
    .from('negative_examples')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteNegativeExample(id) {
  const { error } = await supabase
    .from('negative_examples')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// GENERATION LOG
// ============================================================

export async function logGeneration(payload) {
  const { data, error } = await supabase
    .from('generation_log')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getGenerationLogs(brandId, limit = 50) {
  const { data, error } = await supabase
    .from('generation_log')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function updateGenerationLog(id, updates) {
  const { data, error } = await supabase
    .from('generation_log')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function countGenerationLogsSince(brandId, since) {
  const { count, error } = await supabase
    .from('generation_log')
    .select('*', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .gte('created_at', since)
  if (error) throw error
  return count || 0
}

export async function getGenerationFeedbackSummary(brandId, limit = 50) {
  const { data, error } = await supabase
    .from('generation_log')
    .select('id,intent,output_ar,output_en,score_overall,human_feedback,created_at')
    .eq('brand_id', brandId)
    .not('human_feedback', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// ============================================================
// POST PERFORMANCE
// ============================================================

export async function logPostPerformance(payload) {
  const { data, error } = await supabase
    .from('post_performance')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getPostPerformance(postId) {
  const { data, error } = await supabase
    .from('post_performance')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

export async function getAveragePerformance(brandId) {
  const { data, error } = await supabase
    .from('post_performance')
    .select('reach, likes, comments, shares, saves')
  if (error) throw error
  if (!data?.length) return null
  const avg = (arr, key) => arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length
  return { reach: avg(data, 'reach'), likes: avg(data, 'likes'), comments: avg(data, 'comments'), shares: avg(data, 'shares'), saves: avg(data, 'saves') }
}

// ============================================================
// CONTENT CATEGORIES
// ============================================================

export async function getContentCategories(brandId) {
  const { data, error } = await supabase
    .from('content_categories')
    .select('*')
    .eq('brand_id', brandId)
    .order('category')
  if (error) throw error
  return data
}

export async function upsertContentCategory(brandId, category, catData) {
  const { data: result, error } = await supabase
    .from('content_categories')
    .upsert({
      brand_id: brandId,
      category,
      ...catData,
    }, { onConflict: 'brand_id,category' })
    .select()
    .single()
  if (error) throw error
  return result
}

// ============================================================
// CONTENT IDEAS
// ============================================================

export async function getContentIdeas(brandId, filters = {}) {
  let query = supabase
    .from('content_ideas')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.pillar) query = query.eq('content_pillar', filters.pillar)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createContentIdea(data) {
  const { data: result, error } = await supabase
    .from('content_ideas')
    .insert({ ...data, updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw error
  return result
}

export async function updateContentIdea(id, updates) {
  const { data, error } = await supabase
    .from('content_ideas')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteContentIdea(id) {
  const { error } = await supabase
    .from('content_ideas')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function uploadIdeaImage(file, brandId) {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${brandId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('content-ideas')
    .upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('content-ideas').getPublicUrl(path)
  return data.publicUrl
}

// ============================================================
// CONTENT SERIES
// ============================================================

export async function getContentSeries(brandId) {
  const { data, error } = await supabase
    .from('content_series')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createContentSeries(data) {
  const { data: result, error } = await supabase
    .from('content_series')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return result
}

export async function updateContentSeries(id, updates) {
  const { data, error } = await supabase
    .from('content_series')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteContentSeries(id) {
  const { error } = await supabase
    .from('content_series')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function incrementSeriesPostCount(seriesId) {
  const { data: series } = await supabase
    .from('content_series')
    .select('post_count')
    .eq('id', seriesId)
    .single()
  if (!series) return
  const { error } = await supabase
    .from('content_series')
    .update({ post_count: (series.post_count || 0) + 1 })
    .eq('id', seriesId)
  if (error) throw error
}

// ============================================================
// IDEA ATTACHMENTS
// ============================================================

export const getIdeaAttachments = async (ideaId) => {
  const { data, error } = await supabase.from('idea_attachments').select('*').eq('idea_id', ideaId).order('created_at')
  if (error) throw error
  return data || []
}

export const addIdeaAttachment = async (attachment) => {
  const { data, error } = await supabase.from('idea_attachments').insert(attachment).select().single()
  if (error) throw error
  return data
}

export const deleteIdeaAttachment = async (id) => {
  const { error } = await supabase.from('idea_attachments').delete().eq('id', id)
  if (error) throw error
}
