// Owner-only employee provisioning. Creates an optional Auth account and the payroll profile.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_ROLES = new Set([
  'owner',
  'supervisor',
  'accountant',
  'staff',
  'limited_staff',
])

const PROFILE_FIELDS = [
  'telegram_chat_id',
  'phone',
  'photo_url',
  'employment_type',
  'start_date',
  'department',
  'branch_id',
  'is_active',
  'monthly_salary',
  'monthly_hours',
  'payroll_cost_center_id',
  'hourly_rate',
  'hourly_rate_lyd',
  'days_off',
  'overtime_exempt',
] as const

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const authHeader = req.headers.get('Authorization') || ''

  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userResult, error: userError } = await userClient.auth.getUser()
  if (userError || !userResult.user) return json({ error: 'Invalid token' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userResult.user.id)
    .single()
  if (callerProfile?.role !== 'owner') return json({ error: 'Forbidden - owner only' }, 403)

  let body: {
    email?: string
    password?: string
    mode?: 'password' | 'invite' | 'none'
    profile?: Record<string, unknown>
    redirectTo?: string
  }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  const email = body.email?.trim().toLowerCase()
  const mode = email ? (body.mode || 'invite') : 'none'
  const profile = body.profile || {}
  const fullName = String(profile.full_name || '').trim()

  if (email && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'A valid email is required' }, 400)
  if (!fullName) return json({ error: 'Full name is required' }, 400)
  if (mode !== 'invite' && mode !== 'password' && mode !== 'none') return json({ error: 'Invalid account setup mode' }, 400)
  if (!email && mode !== 'none') return json({ error: 'Email is required to create a web login' }, 400)
  if (email && mode === 'none') return json({ error: 'Choose an account setup mode when an email is provided' }, 400)
  if (mode === 'password' && (!body.password || body.password.length < 6)) {
    return json({ error: 'Password must be at least 6 characters' }, 400)
  }

  const requestedRole = String(profile.role || 'staff')
  if (!ALLOWED_ROLES.has(requestedRole)) return json({ error: 'Invalid employee role' }, 400)

  let authUserId = ''
  let profileId = ''
  if (mode === 'password') {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: body.password!,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: requestedRole },
    })
    if (error) return json({ error: error.message }, 400)
    authUserId = data.user?.id || ''
  } else if (mode === 'invite') {
    const options = {
      data: { full_name: fullName, role: requestedRole },
      ...(body.redirectTo ? { redirectTo: body.redirectTo } : {}),
    }
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, options)
    if (error) return json({ error: error.message }, 400)
    authUserId = data.user?.id || ''
  }

  if (mode !== 'none' && !authUserId) return json({ error: 'Account creation returned no user ID' }, 500)
  profileId = authUserId || crypto.randomUUID()

  const profileRow: Record<string, unknown> = {
    id: profileId,
    full_name: fullName,
    role: requestedRole,
    // This endpoint creates employees, not generic login profiles. Workforce
    // directories and payroll intentionally exclude profiles unless this
    // boundary is explicit.
    is_employee: true,
    payroll_enabled: true,
  }
  if (authUserId) profileRow.auth_user_id = authUserId
  if (email) profileRow.email = email
  for (const field of PROFILE_FIELDS) {
    if (field in profile) profileRow[field] = profile[field]
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert(profileRow, { onConflict: 'id' })
  if (profileError) {
    if (authUserId) await admin.auth.admin.deleteUser(authUserId).catch(() => {})
    return json({ error: `Profile creation failed: ${profileError.message}` }, 500)
  }

  return json({
    ok: true,
    profile_id: profileId,
    email: email || null,
    mode,
    profile: profileRow,
  })
})
