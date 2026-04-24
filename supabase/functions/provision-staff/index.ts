// Supabase Edge Function — provision a staff account (auth user + profile row)
// Deploy: npx supabase functions deploy provision-staff
// Caller must be an authenticated owner. Creates the auth user via Admin API,
// then inserts a matching profiles row. Supports password-set or invite-email mode.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller is an authenticated owner
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'missing Authorization' }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'invalid token' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'owner') return json({ error: 'forbidden — owner only' }, 403)

    const body = await req.json()
    const { email, password, mode, profile } = body as {
      email: string
      password?: string
      mode: 'password' | 'invite'
      profile: Record<string, unknown>
    }

    if (!email || !profile?.full_name) return json({ error: 'email and full_name required' }, 400)
    if (mode === 'password' && (!password || String(password).length < 6)) {
      return json({ error: 'password must be at least 6 characters' }, 400)
    }

    // Create auth user (Admin API)
    let authUserId: string
    if (mode === 'password') {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) return json({ error: error.message }, 400)
      authUserId = data.user.id
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email)
      if (error) return json({ error: error.message }, 400)
      authUserId = data.user.id
    }

    // Insert profile row with matching id (include email for future display)
    const row = { id: authUserId, role: 'staff', email, ...profile }
    const { error: insertErr } = await admin.from('profiles').insert(row)
    if (insertErr) {
      // Roll back the auth user to keep things consistent
      await admin.auth.admin.deleteUser(authUserId).catch(() => {})
      return json({ error: `profile insert failed: ${insertErr.message}` }, 500)
    }

    return json({ id: authUserId, email, mode, profile: row })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
