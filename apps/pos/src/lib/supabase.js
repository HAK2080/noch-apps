import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
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
// PROFILES
// ============================================================

export async function getProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')
  if (error) throw error
  return data
}

export async function getProfile(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getStaffProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'staff')
    .order('full_name')
  if (error) throw error
  return data
}

export async function createStaffProfile(nameOrPayload, telegramChatId) {
  const id = crypto.randomUUID()
  const payload = typeof nameOrPayload === 'string'
    ? { full_name: nameOrPayload, telegram_chat_id: telegramChatId || null }
    : { ...nameOrPayload }
  const row = { id, role: 'staff', ...payload }
  const { error } = await supabase.from('profiles').insert(row)
  if (error) throw error
  return row
}

export async function updateProfile(id, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Save blocked — check permissions (RLS). Contact admin.')
}

export async function deleteProfile(id) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// TASKS
// ============================================================

const TASK_SELECT = '*, assignee:profiles!assigned_to(*), assignees:task_assignments(*, assignee:profiles!task_assignments_assignee_id_fkey(*))'

export async function getTasks(filters = {}) {
  let query = supabase
    .from('tasks')
    .select(TASK_SELECT)
    .order('created_at', { ascending: false })

  if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.priority) query = query.eq('priority', filters.priority)
  if (filters.is_group !== undefined) query = query.eq('is_group', filters.is_group)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getMyTasks(userId) {
  const { data, error } = await supabase
    .rpc('get_user_tasks', { user_id: userId })
  if (error) throw error
  return data
}

export async function getTask(id) {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createTask(task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function updateTask(id, updates) {
  const payload = { ...updates, updated_at: new Date().toISOString() }
  if (updates.status === 'done') payload.completed_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', id)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function deleteTask(id) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function requestTaskCompletion(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ pending_status: 'done' })
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function approveTaskCompletion(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'done', pending_status: null, approval_note: null })
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function rejectTaskCompletion(taskId, note) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ pending_status: null, approval_note: note || null })
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function getPendingApprovals() {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .not('pending_status', 'is', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getTaskStats() {
  const { data, error } = await supabase
    .from('tasks')
    .select('status, due_date')
  if (error) throw error

  const today = new Date().toISOString().split('T')[0]
  return {
    total: data.length,
    pending: data.filter(t => t.status === 'pending').length,
    in_progress: data.filter(t => t.status === 'in_progress').length,
    done: data.filter(t => t.status === 'done').length,
    overdue: data.filter(t => t.status !== 'done' && t.due_date && t.due_date < today).length,
  }
}

// ============================================================
// DASHBOARD — OWNER ATTENTION
// ============================================================

export async function getDashboardAlerts() {
  const today = new Date().toISOString().split('T')[0]

  const [tasksRes, stockRes, ordersRes] = await Promise.allSettled([
    // All non-done tasks with due dates or urgent priority
    supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, created_at')
      .neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false }),

    // Low stock items — fetch all stock, filter in JS below
    supabase
      .from('stock')
      .select('id, qty_available, min_threshold, unit, ingredient:ingredients(id, name, name_ar, category)'),

    // Pending online orders
    supabase
      .from('pos_orders')
      .select('id, order_number, customer_name, customer_phone, payment_method, total, created_at, branch:pos_branches(name)')
      .eq('is_guest', true)
      .eq('source', 'online')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // Tasks: split into overdue and urgent
  const allTasks = tasksRes.status === 'fulfilled' ? (tasksRes.value.data || []) : []
  const overdueTasks = allTasks.filter(t => t.due_date && t.due_date < today)
  const urgentTasks = allTasks.filter(t => t.priority === 'urgent' && (!t.due_date || t.due_date >= today))

  // Low stock: manually filter where qty < threshold
  const allStock = stockRes.status === 'fulfilled' ? (stockRes.value.data || []) : []
  const lowStockItems = allStock.filter(s => s.min_threshold > 0 && s.qty_available < s.min_threshold)

  // Online orders
  const pendingOrders = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : []

  return { overdueTasks, urgentTasks, lowStockItems, pendingOrders }
}

// ============================================================
// TASK ATTACHMENTS
// ============================================================

export async function uploadAttachment(taskId, file) {
  const ext = file.name.split('.').pop()
  const path = `tasks/${taskId}/${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(path, file)
  if (uploadError) throw uploadError

  // Generate a signed URL valid for 1 year (31536000 seconds)
  const { data: urlData, error: urlError } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, 31536000)
  if (urlError) throw urlError

  const { data, error } = await supabase
    .from('task_attachments')
    .insert({ task_id: taskId, file_name: file.name, file_url: urlData.signedUrl, file_type: file.type })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getTaskAttachments(taskId) {
  const { data, error } = await supabase
    .from('task_attachments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function deleteAttachment(id, filePath) {
  await supabase.storage.from('attachments').remove([filePath])
  const { error } = await supabase.from('task_attachments').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// TASK COMMENTS
// ============================================================

export async function getComments(taskId) {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*, author:profiles!task_comments_author_id_fkey(*)')
    .eq('task_id', taskId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function createComment(taskId, authorId, body) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: authorId, body })
    .select('*, author:profiles!task_comments_author_id_fkey(*)')
    .single()
  if (error) throw error
  return data
}

// ============================================================
// REPORT LOGS
// ============================================================

export async function getLastReport() {
  const { data, error } = await supabase
    .from('report_logs')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function logReport(recipientPhone, summary) {
  // week_start is unique — upsert so re-sending the same week updates the timestamp
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Sunday
  const weekStartStr = weekStart.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('report_logs')
    .upsert(
      { week_start: weekStartStr, sent_at: new Date().toISOString(), recipient_phone: recipientPhone, summary },
      { onConflict: 'week_start' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// TASK REMINDERS
// ============================================================

function calcNextSendAt(frequency, options = {}) {
  const now = new Date()
  const [h, m] = (options.sendTime || '09:00').split(':').map(Number)

  if (frequency === 'specific_date' && options.specificDate) {
    const d = new Date(options.specificDate)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }

  const days =
    frequency === 'daily' ? 1
    : frequency === 'every2days' ? 2
    : frequency === 'weekly' ? 7
    : options.intervalDays ?? 1

  const next = new Date(now)
  next.setDate(next.getDate() + (frequency === 'specific_date' ? 0 : days))
  next.setHours(h, m, 0, 0)
  // If computed time is in the past today, keep it as-is (will send on next run)
  return next.toISOString()
}

export async function getReminders(taskId) {
  const { data, error } = await supabase
    .from('task_reminders')
    .select('*')
    .eq('task_id', taskId)
    .eq('active', true)
    .order('next_send_at')
  if (error) throw error
  return data
}

export async function createReminder(taskId, telegramChatId, frequency, options = {}) {
  const next_send_at = calcNextSendAt(frequency, options)
  const { data, error } = await supabase
    .from('task_reminders')
    .insert({
      task_id: taskId,
      phone: telegramChatId,        // kept for schema compat — stores chat_id value
      telegram_chat_id: telegramChatId,
      frequency,
      interval_days: options.intervalDays ?? null,
      specific_date: options.specificDate ?? null,
      send_time: options.sendTime ?? '09:00',
      next_send_at,
      active: true,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteReminder(id) {
  const { error } = await supabase
    .from('task_reminders')
    .update({ active: false })
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// RECIPES
// ============================================================

export async function getRecipes(filters = {}) {
  let query = supabase
    .from('recipes')
    .select('*')
    .order('code')

  if (filters.category) query = query.eq('category', filters.category)
  if (filters.subcategory) query = query.eq('subcategory', filters.subcategory)

  // Archived: only include if explicitly requested
  if (filters.showArchived) {
    // no filter
  } else {
    query = query.eq('is_archived', false)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getRecipe(id) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createRecipe(payload) {
  const { data, error } = await supabase
    .from('recipes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateRecipe(id, updates) {
  const { data, error } = await supabase
    .from('recipes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function archiveRecipe(id) {
  return updateRecipe(id, { is_archived: true })
}

export async function deleteRecipe(id) {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// UTILS
// ============================================================

export function formatDueDate(dateStr, t) {
  if (!dateStr) return t('noDate')
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  if (dateStr === today) return t('today')
  if (dateStr === tomorrow) return t('tomorrow')
  if (dateStr === yesterday) return t('yesterday')
  return new Date(dateStr).toLocaleDateString('ar-LY', { day: 'numeric', month: 'short' })
}

export function isOverdue(task) {
  if (task.status === 'done') return false
  if (!task.due_date) return false
  const today = new Date().toISOString().split('T')[0]
  return task.due_date < today
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
// RECIPE IMAGE UPLOAD
// ============================================================

export async function uploadRecipeImage(recipeId, file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `recipes/${recipeId}/${Date.now()}.${ext}`

  // Upload directly to attachments bucket (known to exist)
  const bucket = 'attachments'

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) {

    throw uploadError
  }


  const { data: urlData, error: urlError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 31536000) // 1 year
  if (urlError) {

    throw urlError
  }

  return urlData.signedUrl
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
// TASK ASSIGNMENTS — Multi-assign support
// ============================================================

export async function getTaskAssignees(taskId) {
  const { data, error } = await supabase
    .from('task_assignments')
    .select('*, assignee:profiles!assignee_id(*)')
    .eq('task_id', taskId)
    .order('assigned_at', { ascending: false })
  if (error) throw error
  return data
}

export async function assignStaffToTask(taskId, staffId, assignedBy) {
  const { data, error } = await supabase
    .from('task_assignments')
    .insert({ task_id: taskId, assignee_id: staffId, assigned_by: assignedBy })
    .select('*, assignee:profiles!assignee_id(*)')
    .single()
  if (error) throw error
  return data
}

export async function removeAssignmentFromTask(taskId, staffId) {
  const { error } = await supabase
    .from('task_assignments')
    .delete()
    .eq('task_id', taskId)
    .eq('assignee_id', staffId)
  if (error) throw error
}

export async function updatePrimaryAssignee(taskId, newAssigneeId) {
  // Update tasks.assigned_to
  const { error: updateError } = await supabase
    .from('tasks')
    .update({ assigned_to: newAssigneeId })
    .eq('id', taskId)
  if (updateError) throw updateError

  // Ensure they're also in task_assignments if not already
  try {
    await assignStaffToTask(taskId, newAssigneeId, null)
  } catch (e) {
    // Ignore if already exists (unique constraint)
    if (!e.message.includes('unique')) throw e
  }
}

// ============================================================
// LOYALTY SYSTEM — Nochi V3.01
// ============================================================

export async function getLoyaltyStats() {
  const { data, error } = await supabase.rpc('get_loyalty_stats')
  // Table/function doesn't exist yet (migration not run) — return null gracefully
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883' || error.message?.includes('does not exist')) return null
    throw error
  }
  return data
}

export async function getLoyaltySettings() {
  const { data, error } = await supabase.from('loyalty_settings').select('*').limit(1).single()
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return null
    throw error
  }
  return data
}

export async function updateLoyaltySettings(settings) {
  const { id, created_at, ...updates } = settings
  const { data, error } = await supabase
    .from('loyalty_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select().single()
  if (error) throw error
  return data
}

export async function getLoyaltyCustomers(filters = {}) {
  let query = supabase
    .from('loyalty_customers')
    .select('*')
    .order('last_visit_at', { ascending: false, nullsFirst: false })

  if (filters.nochi_state) {
    if (Array.isArray(filters.nochi_state)) {
      query = query.in('nochi_state', filters.nochi_state)
    } else {
      query = query.eq('nochi_state', filters.nochi_state)
    }
  }
  if (filters.tier) query = query.eq('tier', filters.tier)

  const { data, error } = await query
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return []
    throw error
  }
  return data
}

export async function getLoyaltyCustomer(id) {
  const { data, error } = await supabase
    .from('loyalty_customers')
    .select(`*, stamps:loyalty_stamps(*), rewards:loyalty_rewards(*), feedback:loyalty_feedback(*)`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function registerLoyaltyCustomer(customer) {
  const { data, error } = await supabase
    .from('loyalty_customers')
    .insert(customer)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteLoyaltyCustomer(id) {
  const { error } = await supabase.from('loyalty_customers').delete().eq('id', id)
  if (error) throw error
}

export async function awardLoyaltyStamp(customerId, awardedBy) {
  const { data, error } = await supabase.functions.invoke('loyalty-stamp', {
    body: { customer_id: customerId, awarded_by: awardedBy },
  })
  if (error) throw new Error(error.message ?? 'Failed to award stamp')
  if (data?.error) throw new Error(data.error)
  return data
}

export async function getLoyaltyRewards(status = 'pending') {
  const { data, error } = await supabase
    .from('loyalty_rewards')
    .select('*, customer:loyalty_customers(full_name, phone)')
    .eq('status', status)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function redeemLoyaltyReward(rewardId, redeemedBy) {
  const { data, error } = await supabase
    .from('loyalty_rewards')
    .update({ status: 'redeemed', redeemed_by: redeemedBy, redeemed_at: new Date().toISOString() })
    .eq('id', rewardId)
    .select().single()
  if (error) throw error
  return data
}

export async function sendLoyaltyNotification(customerId, type, vars = {}) {
  const { data, error } = await supabase.functions.invoke('loyalty-notify', {
    body: { customer_id: customerId, type, vars },
  })
  if (error) throw new Error(error.message ?? 'Failed to send notification')
  if (data?.error) throw new Error(data.error)
  return data
}

export async function submitLoyaltyFeedback(customerId, rating, comment) {
  const { data, error } = await supabase.functions.invoke('loyalty-feedback', {
    body: { customer_id: customerId, rating, comment },
  })
  if (error) throw new Error(error.message ?? 'Failed to submit feedback')
  if (data?.error) throw new Error(data.error)
  return data
}

export async function lookupLoyaltyQR(qrToken) {
  const { data, error } = await supabase
    .from('loyalty_qr_tokens')
    .select('*, customer:loyalty_customers(*)')
    .eq('token', qrToken)
    .single()
  if (error) throw error
  return data?.customer || null
}

export async function generateLoyaltyQR() {
  // Generate token directly in DB (no edge function needed)
  const token = 'NOCHI-' + Math.random().toString(36).substring(2, 7).toUpperCase()
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('loyalty_qr_tokens')
    .insert({ token, expires_at })
    .select()
    .single()
  if (error) throw new Error(error.message ?? 'Failed to generate QR')
  return { token: data.token, expires_at: data.expires_at, expires_in_seconds: 300 }
}

export async function getMyLoyaltyCard(userId) {
  // Find customer by their profile phone or linked account
  // For Phase 1: customer is linked by user profile
  const { data: profile } = await supabase.from('profiles').select('phone').eq('id', userId).single()
  if (!profile?.phone) return null

  const { data, error } = await supabase
    .from('loyalty_customers')
    .select('*, rewards:loyalty_rewards(*), stamps:loyalty_stamps(*)')
    .eq('phone', profile.phone)
    .single()
  if (error) return null
  return data
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
// VESTABOARD
// ============================================================

export async function getVestaboardMessages() {
  const { data, error } = await supabase
    .from('vestaboard_messages')
    .select('*, submitted_by_profile:profiles!vestaboard_messages_submitted_by_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

export async function submitVestaboardMessage(message) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('vestaboard_messages')
    .insert({ message, submitted_by: user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function approveVestaboardMessage(id) {
  const { data, error } = await supabase
    .from('vestaboard_messages')
    .update({ status: 'approved' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function rejectVestaboardMessage(id, note) {
  const { data, error } = await supabase
    .from('vestaboard_messages')
    .update({ status: 'rejected', rejection_note: note })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function markVestaboardSent(id) {
  const { data, error } = await supabase
    .from('vestaboard_messages')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// GOOGLE MAPS REVIEW NUDGE
// ============================================================

export async function requestGoogleReview(customerId, branchId) {
  // Mark review as requested
  const { error } = await supabase
    .from('loyalty_customers')
    .update({ review_requested_at: new Date().toISOString() })
    .eq('id', customerId)
  if (error) throw error

  // Get branch google_maps_url and customer phone + full_name
  const { data: branch } = await supabase
    .from('pos_branches')
    .select('name, google_maps_url')
    .eq('id', branchId)
    .single()

  const { data: customer } = await supabase
    .from('loyalty_customers')
    .select('phone, full_name')
    .eq('id', customerId)
    .single()

  return { branch, customer }
}

export async function updateBranchGoogleMapsUrl(branchId, url) {
  const { data, error } = await supabase
    .from('pos_branches')
    .update({ google_maps_url: url })
    .eq('id', branchId)
    .select()
    .single()
  if (error) throw error
  return data
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
// STAFF — profile management helpers
// ============================================================

export const updateStaffProfile = async (id, data) => {
  const { error } = await supabase.from('profiles').update(data).eq('id', id)
  if (error) throw error
}
export const requestRoleChange = async (staffId, requestedRole) => {
  const { error } = await supabase.from('profiles').update({ role_requested: requestedRole, role_approved: false }).eq('id', staffId)
  if (error) throw error
}
export const approveRoleChange = async (staffId, role) => {
  const { error } = await supabase.from('profiles').update({ role, role_requested: null, role_approved: true }).eq('id', staffId)
  if (error) throw error
}
export const denyRoleChange = async (staffId) => {
  const { error } = await supabase.from('profiles').update({ role_requested: null, role_approved: false }).eq('id', staffId)
  if (error) throw error
}

// ============================================================
// ROLE PERMISSIONS — RBAC
// ============================================================

export const getRolePermissions = async () => {
  const { data, error } = await supabase.from('role_permissions').select('*').order('role')
  if (error) throw error
  return data
}
export const updateRolePermission = async (role, feature, canAccess, canEdit) => {
  const { error } = await supabase.from('role_permissions').upsert({ role, feature, can_access: canAccess, can_edit: canEdit, updated_at: new Date().toISOString() }, { onConflict: 'role,feature' })
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

// ============================================================
// LOYALTY — gamification helpers
// ============================================================

export const awardPoints = async (customerId, points) => {
  try {
    const { error } = await supabase.rpc('increment_loyalty_points', { customer_id: customerId, points_to_add: points })
    if (error) throw error
  } catch {
    // fallback if RPC doesn't exist
    const { data: customer } = await supabase.from('loyalty_customers').select('points').eq('id', customerId).single()
    await supabase.from('loyalty_customers').update({ points: (customer?.points || 0) + points }).eq('id', customerId)
  }
}
export const getCustomerBadges = async (customerId) => {
  const { data, error } = await supabase.from('loyalty_customer_badges').select('*').eq('customer_id', customerId)
  if (error) throw error
  return data || []
}
export const awardBadge = async (customerId, badgeKey) => {
  const { error } = await supabase.from('loyalty_customer_badges').upsert({ customer_id: customerId, badge_key: badgeKey }, { onConflict: 'customer_id,badge_key', ignoreDuplicates: true })
  if (error) throw error
}
export const getSpinPrizes = async () => {
  const { data, error } = await supabase.from('loyalty_spin_prizes').select('*').eq('is_active', true)
  if (error) throw error
  return data || []
}
export const recordSpin = async (customerId, prizeId, resultLabel) => {
  const { data, error } = await supabase.from('loyalty_spins').insert({ customer_id: customerId, prize_id: prizeId, result_label: resultLabel }).select().single()
  if (error) throw error
  return data
}
export const getLastSpin = async (customerId) => {
  const { data } = await supabase.from('loyalty_spins').select('spun_at').eq('customer_id', customerId).order('spun_at', { ascending: false }).limit(1).single()
  return data?.spun_at || null
}
export const getGestures = async (types = []) => {
  let query = supabase.from('loyalty_gestures').select('*').eq('is_active', true)
  if (types.length > 0) query = query.in('content_type', types)
  const { data, error } = await query
  if (error) throw error
  return data || []
}
