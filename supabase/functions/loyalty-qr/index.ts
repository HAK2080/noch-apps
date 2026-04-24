// loyalty-qr: Generate rotating QR tokens for the counter display

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const sbHeaders = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Prefer': 'return=representation',
}

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let token = 'NOCHI-'
  for (let i = 0; i < 6; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'generate'

    if (action === 'generate') {
      // Generate a new token valid for 5 minutes
      const token = generateToken()
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

      const res = await fetch(`${SUPABASE_URL}/rest/v1/loyalty_qr_tokens`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ token, expires_at: expiresAt }),
      })
      const data = await res.json()

      return new Response(JSON.stringify({
        token,
        expires_at: expiresAt,
        expires_in_seconds: 300,
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (action === 'validate') {
      const token = url.searchParams.get('token')
      if (!token) return new Response(JSON.stringify({ valid: false, error: 'No token' }), { status: 400 })

      const now = new Date().toISOString()
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/loyalty_qr_tokens?token=eq.${token}&used_at=is.null&expires_at=gt.${now}&limit=1`,
        { headers: sbHeaders }
      )
      const tokens = await res.json()

      return new Response(JSON.stringify({
        valid: tokens?.length > 0,
        token_id: tokens?.[0]?.id,
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
