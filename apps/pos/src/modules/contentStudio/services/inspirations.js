import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_inspirations'
const BUCKET = 'content-studio-inspirations'

export async function listInspirations({ businessId, status } = {}) {
  let q = supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  if (businessId) q = q.eq('business_id', businessId)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getInspiration(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createInspiration(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateInspiration(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteInspiration(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

export async function uploadInspirationScreenshot(businessId, file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${businessId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { path, publicUrl: data.publicUrl }
}
