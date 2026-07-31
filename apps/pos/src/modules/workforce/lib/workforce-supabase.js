import { supabase } from '../../../lib/supabase'

export async function getWorkforceSummary(periodFrom, periodTo) {
  const { data, error } = await supabase.rpc('workforce_control_summary_v2', {
    p_from: periodFrom,
    p_to: periodTo,
  })
  if (error) throw error
  return data
}

export async function listWorkforceAttendance(limit = 100) {
  const { data, error } = await supabase
    .from('workforce_attendance_v2')
    .select('*')
    .order('clocked_in_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function listWorkforceSchedule(fromIso, toIso) {
  const { data, error } = await supabase
    .from('workforce_schedule_shifts')
    .select('*, profiles!workforce_schedule_shifts_profile_id_fkey(full_name), pos_branches(name, name_ar)')
    .gte('starts_at', fromIso)
    .lt('starts_at', toIso)
    .order('starts_at')
  if (error) throw error
  return data || []
}

export async function upsertScheduleShift({ id = null, profileId, branchId, startsAt, endsAt, note }) {
  const { data, error } = await supabase.rpc('workforce_upsert_schedule_shift_v2', {
    p_id: id,
    p_profile_id: profileId,
    p_branch_id: branchId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

export async function publishScheduleWeek(weekStart) {
  const { data, error } = await supabase.rpc('workforce_publish_schedule_week_v2', {
    p_week_start: weekStart,
  })
  if (error) throw error
  return data
}

export async function listActiveBranches() {
  const { data, error } = await supabase
    .from('pos_branches')
    .select('id, name, name_ar')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data || []
}
