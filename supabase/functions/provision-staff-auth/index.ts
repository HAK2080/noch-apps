// Supabase Edge Function — create or reset auth credentials for a staff member
// Deploy: npx supabase functions deploy provision-staff-auth --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { profile_id, email, password, action, auth_user_id } = await req.json()

    if (!profile_id || !email || !password) {
      return json({ error: 'Missing required fields: profile_id, email, password' }, 400)
    }

    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!serviceRole || !supabaseUrl) return json({ error: 'Server misconfigured — missing env vars' }, 500)

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (action === 'reset_password') {
      // auth_user_id is stored in the profile from initial creation
      if (!auth_user_id) return json({ error: 'No auth account linked to this profile yet. Use "Grant Access" first.' }, 400)

      const { error: updateErr } = await admin.auth.admin.updateUserById(auth_user_id, { password })
      if (updateErr) return json({ error: updateErr.message }, 400)

      return json({ success: true, action: 'password_reset' })
    }

    // action === 'create' (default)
    const { data: createData, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr) {
      // "already registered" — tell the owner to use reset instead
      if (createErr.message?.toLowerCase().includes('already')) {
        return json({ error: 'An account with this email already exists. Use "Reset Password" instead.' }, 409)
      }
      return json({ error: createErr.message }, 400)
    }

    const newUserId = createData?.user?.id
    if (!newUserId) return json({ error: 'Auth user created but no ID returned' }, 500)

    // Store email + auth_user_id on the profile so login lookup and reset both work
    const { error: profileErr } = await admin
      .from('profiles')
      .update({ email, auth_user_id: newUserId })
      .eq('id', profile_id)

    if (profileErr) {
      // Auth user was created — still return success with a warning
      return json({ success: true, auth_user_id: newUserId, warning: profileErr.message })
    }

    return json({ success: true, auth_user_id: newUserId })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, 500)
  }
})
