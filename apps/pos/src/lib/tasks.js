import { supabase } from './supabase'

// ============================================================
// TASKS
// ============================================================

const TASK_SELECT = '*, assignees:task_assignments(*)'

async function getTaskDirectory() {
  const [{ data: directory, error }, ownerDirectory] = await Promise.all([
    supabase.rpc('profile_directory_v2', { p_active_only: false }),
    supabase.rpc('workforce_team_v2'),
  ])
  if (error) throw error

  const ownerContacts = new Map(
    (ownerDirectory.error ? [] : ownerDirectory.data || [])
      .map(profile => [profile.id, profile.telegram_chat_id || null])
  )

  return new Map((directory || []).map(profile => [
    profile.id,
    {
      ...profile,
      telegram_chat_id: ownerContacts.get(profile.id) || null,
    },
  ]))
}

async function hydrateTasks(rows) {
  if (!rows?.length) return []
  const directory = await getTaskDirectory()
  return rows.map(task => ({
    ...task,
    assignee: directory.get(task.assigned_to) || null,
    assignees: (task.assignees || []).map(assignment => ({
      ...assignment,
      assignee: directory.get(assignment.assignee_id) || null,
    })),
  }))
}

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
  return hydrateTasks(data)
}

export async function getMyTasks(userId) {
  const { data, error } = await supabase
    .rpc('get_user_tasks', { user_id: userId })
  if (error) throw error
  return hydrateTasks(data || [])
}

export async function getTask(id) {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return (await hydrateTasks([data]))[0]
}

export async function createTask(task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return (await hydrateTasks([data]))[0]
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
  return (await hydrateTasks([data]))[0]
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
  return (await hydrateTasks([data]))[0]
}

export async function approveTaskCompletion(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'done', pending_status: null, approval_note: null })
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return (await hydrateTasks([data]))[0]
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
  return hydrateTasks(data || [])
}

// Local date string (YYYY-MM-DD) — NOT UTC: toISOString() shifts dates back a
// day in Libya (UTC+2), which made "today"/overdue checks wrong before 2 AM.
const localYmd = (d = new Date()) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }

export async function getTaskStats() {
  const { data, error } = await supabase
    .from('tasks')
    .select('status, due_date')
  if (error) throw error

  const today = localYmd()
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
  const today = localYmd()

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
    .select('*')
    .eq('task_id', taskId)
    .order('created_at')
  if (error) throw error
  const directory = await getTaskDirectory()
  return (data || []).map(comment => ({
    ...comment,
    author: directory.get(comment.author_id) || null,
  }))
}

export async function createComment(taskId, authorId, body) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: authorId, body })
    .select('*')
    .single()
  if (error) throw error
  const directory = await getTaskDirectory()
  return { ...data, author: directory.get(data.author_id) || null }
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
  const weekStartStr = localYmd(weekStart)

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
// TASK UTILS
// ============================================================

export function formatDueDate(dateStr, t) {
  if (!dateStr) return t('noDate')
  const today = localYmd()
  const tomorrow = localYmd(new Date(Date.now() + 86400000))
  const yesterday = localYmd(new Date(Date.now() - 86400000))
  if (dateStr === today) return t('today')
  if (dateStr === tomorrow) return t('tomorrow')
  if (dateStr === yesterday) return t('yesterday')
  return new Date(dateStr).toLocaleDateString('ar-LY', { day: 'numeric', month: 'short' })
}

export function isOverdue(task) {
  if (task.status === 'done') return false
  if (!task.due_date) return false
  const today = localYmd()
  return task.due_date < today
}

// ============================================================
// TASK ASSIGNMENTS — Multi-assign support
// ============================================================

export async function getTaskAssignees(taskId) {
  const { data, error } = await supabase
    .from('task_assignments')
    .select('*')
    .eq('task_id', taskId)
    .order('assigned_at', { ascending: false })
  if (error) throw error
  const directory = await getTaskDirectory()
  return (data || []).map(assignment => ({
    ...assignment,
    assignee: directory.get(assignment.assignee_id) || null,
  }))
}

export async function assignStaffToTask(taskId, staffId, assignedBy) {
  const { data, error } = await supabase
    .from('task_assignments')
    .insert({ task_id: taskId, assignee_id: staffId, assigned_by: assignedBy })
    .select('*')
    .single()
  if (error) throw error
  const directory = await getTaskDirectory()
  return { ...data, assignee: directory.get(data.assignee_id) || null }
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
