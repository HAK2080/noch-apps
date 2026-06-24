import { supabase } from './supabase'

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

export async function unarchiveRecipe(id) {
  return updateRecipe(id, { is_archived: false })
}

export async function deleteRecipe(id) {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function uploadRecipeImage(recipeId, file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `recipes/${recipeId}/${Date.now()}.${ext}`

  const bucket = 'attachments'

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) throw uploadError

  const { data: urlData, error: urlError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 31536000) // 1 year
  if (urlError) throw urlError

  return urlData.signedUrl
}
