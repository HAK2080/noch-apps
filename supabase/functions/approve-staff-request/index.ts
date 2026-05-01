// approve-staff-request: owner-only. Invites the requester via email,
// creates the profile row, marks the request approved.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'missing Authorization' }, 401)

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userResult, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userResult?.user) return json({ error: 'invalid token' }, 401)
  const caller = userResult.user

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: callerProfile } = await admin
    .from('profiles').select('role').eq('id', caller.id).single()
  if (callerProfile?.role !== 'owner') return json({ error: 'forbidden — owner only' }, 403)

  let body: { request_id?: string; profile?: Record<string, unknown> } = {}
  try { body = await req.json() } catch { return json({ error: 'invalid JSON' }, 400) }
  const { request_id, profile } = body
  if (!request_id || !profile) return json({ error: 'request_id and profile required' }, 400)

  // Load and validate the request
  const { data: reqRow, error: reqErr } = await admin
    .from('staff_access_requests')
    .select('id, email, status, full_name, phone')
    .eq('id', request_id).single()
  if (reqErr || !reqRow) return json({ error: 'request not found' }, 404)
  if (reqRow.status !== 'pending') return json({ error: `request already ${reqRow.status}` }, 409)

  // Send Supabase invite. Idempotent: if the user already exists, fall back to a password reset email.
  let authUserId: string
  const inviteRedirect = (body as { redirectTo?: string }).redirectTo
    || `${SUPABASE_URL.replace('.supabase.co', '.supabase.co')}` // placeholder; client will pass redirectTo
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    reqRow.email,
    inviteRedirect ? { redirectTo: inviteRedirect } : undefined,
  )
  if (inviteErr) {
    // Already registered → look up the user, send a magic-link reset, continue
    if (inviteErr.message?.toLowerCase().includes('already')) {
      const { data: lookup, error: lookupErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
      if (lookupErr) return json({ error: `lookup failed: ${lookupErr.message}` }, 500)
      const existing = lookup?.users?.find((u) => u.email?.toLowerCase() === reqRow.email.toLowerCase())
      if (!existing) return json({ error: 'user reported existing but could not be found' }, 500)
      authUserId = existing.id
      // Trigger a password reset email so they get a fresh way in
      await admin.auth.resetPasswordForEmail(reqRow.email).catch(() => {})
    } else {
      return json({ error: inviteErr.message }, 400)
    }
  } else {
    authUserId = invited?.user?.id || ''
    if (!authUserId) return json({ error: 'invite succeeded but no user id returned' }, 500)
  }

  // Insert profile (or update if a stub already exists).
  const profileRow = {
    id: authUserId,
    role: 'staff',
    email: reqRow.email,
    auth_user_id: authUserId,
    ...profile,
  }
  const { error: upsertErr } = await admin
    .from('profiles')
    .upsert(profileRow, { onConflict: 'id' })
  if (upsertErr) return json({ error: `profile upsert failed: ${upsertErr.message}` }, 500)

  // Mark request approved
  const { error: updateErr } = await admin
    .from('staff_access_requests')
    .update({ status: 'approved', reviewed_by: caller.id, reviewed_at: new Date().toISOString() })
    .eq('id', request_id)
  if (updateErr) return json({ error: `request update failed: ${updateErr.message}`, profile_id: authUserId }, 500)

  return json({ ok: true, profile_id: authUserId, email: reqRow.email })
})
