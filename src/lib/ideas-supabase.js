// src/lib/ideas-supabase.js
import { supabase } from './supabase'

// ── Categories ────────────────────────────────────────────────────────────────

export async function getIdeaCategories() {
  const { data, error } = await supabase
    .from('idea_categories')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function createIdeaCategory(fields) {
  const { data, error } = await supabase
    .from('idea_categories')
    .insert(fields)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateIdeaCategory(id, fields) {
  const { data, error } = await supabase
    .from('idea_categories')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteIdeaCategory(id) {
  // Orphaned ideas will have category_id set to null by ON DELETE SET NULL
  const { error } = await supabase
    .from('idea_categories')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function reorderIdeaCategories(orderedIds) {
  // orderedIds: array of ids in desired order
  const updates = orderedIds.map((id, index) =>
    supabase.from('idea_categories').update({ sort_order: index + 1 }).eq('id', id)
  )
  await Promise.all(updates)
}

// ── Ideas ─────────────────────────────────────────────────────────────────────

export async function getIdeas() {
  const { data, error } = await supabase
    .from('ideas')
    .select('*, category:idea_categories(*), submitter:profiles!submitted_by(id, full_name), idea_attachments(count)')
    .order('created_at', { ascending: false })
  if (error) throw error
  // Flatten the embedded count: idea_attachments is [{count: N}] → attachment_count: N
  return (data || []).map(idea => ({
    ...idea,
    attachment_count: idea.idea_attachments?.[0]?.count ?? 0,
  }))
}

export async function createIdea(fields) {
  const { data, error } = await supabase
    .from('ideas')
    .insert(fields)
    .select('*, category:idea_categories(*), submitter:profiles!submitted_by(id, full_name)')
    .single()
  if (error) throw error
  return data
}

export async function updateIdea(id, fields) {
  const { data, error } = await supabase
    .from('ideas')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, category:idea_categories(*), submitter:profiles!submitted_by(id, full_name)')
    .single()
  if (error) throw error
  return data
}

export async function deleteIdea(id) {
  const { error } = await supabase
    .from('ideas')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function convertIdeaToTask(ideaId, taskId) {
  return updateIdea(ideaId, {
    converted_task_id: taskId,
    status: 'in_progress',
  })
}
