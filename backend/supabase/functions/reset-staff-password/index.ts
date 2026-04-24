// Supabase Edge Function — reset a staff member's password or send a reset email
// Caller must be an authenticated owner.
// Modes: 'set' (set new password directly) | 'email' (send password reset email)

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

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'missing Authorization' }, 401)

    // Verify caller
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
    const { staffId, newPassword, mode } = body as {
      staffId: string
      newPassword?: string
      mode: 'set' | 'email'
    }

    if (!staffId) return json({ error: 'staffId required' }, 400)

    if (mode === 'set') {
      if (!newPassword || String(newPassword).length < 6) {
        return json({ error: 'password must be at least 6 characters' }, 400)
      }
      // Use direct Admin REST API — more reliable than SDK wrapper
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${staffId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      })
      const resData = await res.json()
      if (!res.ok) return json({ error: resData.message || resData.msg || 'Failed to update password' }, res.status)
      return json({ ok: true, mode: 'set' })
    }

    if (mode === 'email') {
      // Get email via Admin REST API
      const getRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${staffId}`, {
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
        },
      })
      const userData = await getRes.json()
      if (!getRes.ok || !userData.email) return json({ error: 'could not find staff email' }, 400)

      // Send reset email via Admin REST API
      const resetRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'recovery', email: userData.email }),
      })
      const resetData = await resetRes.json()
      if (!resetRes.ok) return json({ error: resetData.message || 'Failed to generate reset link' }, resetRes.status)
      return json({ ok: true, mode: 'email', email: userData.email })
    }

    return json({ error: 'mode must be "set" or "email"' }, 400)
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
