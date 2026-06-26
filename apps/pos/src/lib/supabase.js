import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Refresh tokens silently so kiosk devices stay logged in indefinitely
    // and regular staff don't get bounced after the 1h access-token TTL.
    autoRefreshToken: true,
    persistSession: true,
  }
})

// ============================================================
// EDGE FUNCTION CALLER
// ============================================================
async function callEdgeFunction(name, payload) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload })
  if (error) {
    // Try to extract the real error message from the response body
    if (error.context) {
      try {
        const body = await error.context.clone().json()
        const msg = body?.error || body?.message
        if (msg) throw new Error(msg)
      } catch (innerErr) {
        // Only re-throw if it's our own Error (not a JSON parse error)
        if (innerErr instanceof Error && innerErr !== error) throw innerErr
      }
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data
}

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

// ============================================================
// COST CALCULATOR - Currency helpers
// ============================================================

export async function getCurrencyRates() {
  const { data, error } = await supabase
    .from('currency_rates')
    .select('*')
  if (error) throw error
  return data.reduce((acc, r) => ({ ...acc, [r.currency]: parseFloat(r.rate_to_lyd) }), {})
}

export async function updateCurrencyRate(currency, rate) {
  const { error } = await supabase
    .from('currency_rates')
    .update({ rate_to_lyd: rate, updated_at: new Date().toISOString() })
    .eq('currency', currency)
  if (error) throw error
}

// ============================================================
// COST CALCULATOR - Unit conversion helpers
// ============================================================

const UNIT_TO_BASE = {
  kg: { base: 'g', factor: 1000 },
  g: { base: 'g', factor: 1 },
  L: { base: 'ml', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  piece: { base: 'piece', factor: 1 },
}

export function convertToBaseUnit(qty, unit) {
  const conv = UNIT_TO_BASE[unit]
  if (!conv) return { qty, base: unit }
  return { qty: qty * conv.factor, base: conv.base }
}

export function calcCostPerBaseUnit(bulkQty, bulkUnit, bulkCost, currency, rates) {
  const { qty: baseQty } = convertToBaseUnit(bulkQty, bulkUnit)
  const costInLyd = bulkCost * (rates[currency] || 1)
  return costInLyd / baseQty
}

export function calcIngredientCost(costPerBaseUnit, qtyUsed) {
  return costPerBaseUnit * qtyUsed
}

// ============================================================
// COST CALCULATOR - Ingredients CRUD
// ============================================================

export async function getIngredientsForCost() {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function createIngredientForCost(ingredient) {
  const { data, error } = await supabase
    .from('ingredients')
    .insert(ingredient)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateIngredientForCost(id, updates) {
  const { data, error } = await supabase
    .from('ingredients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteIngredientForCost(id) {
  const { error } = await supabase
    .from('ingredients')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// COST CALCULATOR - Stock CRUD
// ============================================================

export async function getStock() {
  const { data, error } = await supabase
    .from('stock')
    .select('*, ingredient:ingredients(name, base_unit)')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function upsertStock(ingredientId, qty, unit, minThreshold) {
  const { data, error } = await supabase
    .from('stock')
    .upsert({
      ingredient_id: ingredientId,
      qty_available: qty,
      unit,
      min_threshold: minThreshold || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ingredient_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateStockQty(ingredientId, newQty, changeType, notes) {
  const { data: current } = await supabase
    .from('stock')
    .select('qty_available')
    .eq('ingredient_id', ingredientId)
    .single()

  const oldQty = current ? parseFloat(current.qty_available) : 0
  const qtyChange = newQty - oldQty

  const { error: updateError } = await supabase
    .from('stock')
    .update({ qty_available: newQty, updated_at: new Date().toISOString() })
    .eq('ingredient_id', ingredientId)
  if (updateError) throw updateError

  const { error: logError } = await supabase
    .from('stock_logs')
    .insert({
      ingredient_id: ingredientId,
      qty_change: qtyChange,
      type: changeType,
      notes,
    })
  if (logError) throw logError
}

export async function removeStockItem(ingredientId) {
  const { error } = await supabase
    .from('stock')
    .delete()
    .eq('ingredient_id', ingredientId)
  if (error) throw error
}

export async function getStockLogs(ingredientId) {
  let query = supabase
    .from('stock_logs')
    .select('*, ingredient:ingredients(name)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (ingredientId) {
    query = query.eq('ingredient_id', ingredientId)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

// ============================================================
// COST CALCULATOR - Cost Recipes CRUD (aliased functions)
// ============================================================

export async function getRecipesForCost() {
  const { data, error } = await supabase
    .from('cost_recipes')
    .select(`*, category:categories(name, icon), recipe_ingredients(*, ingredient:ingredients(*))`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getRecipeForCost(id) {
  const { data, error } = await supabase
    .from('cost_recipes')
    .select(`*, category:categories(name, icon), recipe_ingredients(*, ingredient:ingredients(*))`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createRecipeForCost(recipe, ingredients) {
  const { data: recipeData, error: recipeError } = await supabase
    .from('cost_recipes')
    .insert(recipe)
    .select()
    .single()
  if (recipeError) throw recipeError

  if (ingredients.length > 0) {
    const items = ingredients.map((ing, i) => ({
      recipe_id: recipeData.id,
      ingredient_id: ing.ingredient_id || null,
      custom_name: ing.custom_name || null,
      qty_used: ing.qty_used,
      unit: ing.unit,
      is_fixed_cost: ing.is_fixed_cost || false,
      fixed_cost_lyd: ing.fixed_cost_lyd || 0,
      sort_order: i,
    }))
    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(items)
    if (ingError) throw ingError
  }

  return recipeData
}

export async function updateRecipeForCost(id, recipe, ingredients) {
  const { error: recipeError } = await supabase
    .from('cost_recipes')
    .update({ ...recipe, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (recipeError) throw recipeError

  // Delete old ingredients and re-insert
  const { error: delError } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('recipe_id', id)
  if (delError) throw delError

  if (ingredients.length > 0) {
    const items = ingredients.map((ing, i) => ({
      recipe_id: id,
      ingredient_id: ing.ingredient_id || null,
      custom_name: ing.custom_name || null,
      qty_used: ing.qty_used,
      unit: ing.unit,
      is_fixed_cost: ing.is_fixed_cost || false,
      fixed_cost_lyd: ing.fixed_cost_lyd || 0,
      sort_order: i,
    }))
    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(items)
    if (ingError) throw ingError
  }
}

export async function deleteRecipeForCost(id) {
  const { error } = await supabase.from('cost_recipes').delete().eq('id', id)
  if (error) throw error
}

export async function getCategoriesForCost() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function createCategoryForCost(name, icon) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, icon })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCategoryForCost(id) {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// COST CALCULATOR HELPERS
// ============================================================

// Aliases for cost calculator (ingredient functions)
export const createIngredient = createIngredientForCost
export const updateIngredient = updateIngredientForCost
export const deleteIngredient = deleteIngredientForCost
export const getIngredients = getIngredientsForCost

// Create category function wrapper
export const createCategory = createCategoryForCost
export const deleteCategory = deleteCategoryForCost

// Fetch all categories
export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}


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

// ============================================================
// CONTENT STUDIO — BRANDS
// ============================================================

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
// CONTENT STUDIO — BRAND MATERIALS
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
// CONTENT STUDIO — RESEARCH
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
// CONTENT STUDIO — POSTS
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
// CONTENT STUDIO — CALENDAR
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
// CONTENT STUDIO — EXPERIMENTS
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
// CONTENT STUDIO — SWIPE FILE
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
// CONTENT STUDIO — GENERATE (via Edge Function)
// ============================================================

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

// ============================================================
// CONTENT STUDIO — SCOUT SOURCES
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
// CONTENT ENGINE — VOICE FINGERPRINT
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
// CONTENT ENGINE — DIALECT CORPUS
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
// CONTENT ENGINE — NEGATIVE EXAMPLES
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
// CONTENT ENGINE — GENERATION LOG
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

// ============================================================
// CONTENT ENGINE — POST PERFORMANCE
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

// Count generation logs since a given date (for self-improvement loop)
export async function countGenerationLogsSince(brandId, since) {
  const { count, error } = await supabase
    .from('generation_log')
    .select('*', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .gte('created_at', since)
  if (error) throw error
  return count || 0
}

// Get aggregated feedback summary for self-improvement loop
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
// CONTENT ENGINE — CONTENT CATEGORIES
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
// V3 — INVENTORY & PROCUREMENT
// ============================================================

export async function getProcurementOrders(ingredientId) {
  let query = supabase.from('procurement_orders').select('*, ingredient:ingredients(name)').order('created_at', { ascending: false })
  if (ingredientId) query = query.eq('ingredient_id', ingredientId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createProcurementOrder(payload) {
  const { data, error } = await supabase.from('procurement_orders').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateProcurementOrder(id, updates) {
  const { data, error } = await supabase.from('procurement_orders').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function uploadIngredientImage(ingredientId, file) {
  const ext = file.name.split('.').pop()
  const path = `ingredients/${ingredientId}/${Date.now()}.${ext}`
  const { error: uploadErr } = await supabase.storage.from('ingredients').upload(path, file)
  if (uploadErr) throw uploadErr
  const { data: { publicUrl } } = supabase.storage.from('ingredients').getPublicUrl(path)
  await supabase.from('ingredients').update({ image_url: publicUrl }).eq('id', ingredientId)
  return publicUrl
}

export async function updateIngredientSupplier(id, updates) {
  const { data, error } = await supabase.from('ingredients').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function extractInventoryFromFile(fileBase64, mimeType, knownIngredients) {
  return callEdgeFunction('extract-inventory', { file_base64: fileBase64, mime_type: mimeType, known_ingredients: knownIngredients })
}

export async function checkWebPrice(ingredientName, unit) {
  return callEdgeFunction('check-web-prices', { ingredient_name: ingredientName, unit })
}

// ============================================================
// V3 — BUSINESS ANALYTICS
// ============================================================

export async function getSalesUploads() {
  const { data, error } = await supabase.from('sales_uploads').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createSalesUpload(payload) {
  const { data, error } = await supabase.from('sales_uploads').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateSalesUpload(id, updates) {
  const { data, error } = await supabase.from('sales_uploads').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function getBusinessMetrics(filters = {}) {
  let query = supabase.from('business_metrics').select('*').order('period_start', { ascending: false })
  if (filters.periodType) query = query.eq('period_type', filters.periodType)
  if (filters.limit) query = query.limit(filters.limit)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function upsertBusinessMetrics(payload) {
  const { data, error } = await supabase.from('business_metrics').upsert(payload, { onConflict: 'period_start,period_end,period_type' }).select().single()
  if (error) throw error
  return data
}

export async function uploadSalesFile(file) {
  const ext = file.name.split('.').pop()
  const path = `sales/${Date.now()}.${ext}`
  const { error: uploadErr } = await supabase.storage.from('sales').upload(path, file)
  if (uploadErr) throw uploadErr
  const { data: { publicUrl } } = supabase.storage.from('sales').getPublicUrl(path)
  return publicUrl
}

export async function processSalesData(uploadId, fileBase64, mimeType, fileType) {
  return callEdgeFunction('process-sales-data', {
    upload_id: uploadId,
    file_base64: fileBase64,
    mime_type: mimeType,
    file_type: fileType,
  })
}

export async function generateExecutiveReport(metrics) {
  return callEdgeFunction('process-sales-data', {
    mode: 'generate_report',
    metrics,
  })
}

// ============================================================
// CONTENT IDEAS (Idea Bank)
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
// INVENTORY — tier & flags helpers
// ============================================================

export const updateInventoryTier = async (id, tier, aiSuggested = false) => {
  const { data, error } = await supabase.from('ingredients').update({ tier, ai_tier_suggested: aiSuggested }).eq('id', id)
  if (error) throw error
  return data
}
export const updateInventoryFlags = async (id, flags) => {
  const { data, error } = await supabase.from('ingredients').update(flags).eq('id', id)
  if (error) throw error
  return data
}
export const getSuppliers = async () => {
  const { data, error } = await supabase.from('suppliers').select('*').order('name')
  if (error) throw error
  return data
}
export const createSupplier = async (supplier) => {
  const { data, error } = await supabase.from('suppliers').insert(supplier).select().single()
  if (error) throw error
  return data
}
export const updateSupplier = async (id, supplier) => {
  const { data, error } = await supabase.from('suppliers').update(supplier).eq('id', id).select().single()
  if (error) throw error
  return data
}
export const deleteSupplier = async (id) => {
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// IDEAS — attachments
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

