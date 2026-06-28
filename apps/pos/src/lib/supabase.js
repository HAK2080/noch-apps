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
