// loyalty-stamp: Award a stamp to a customer by QR token or direct ID
// Called by: app QR scan, or Odoo POS webhook

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const headers = { 'Content-Type': 'application/json' }
const sbHeaders = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
}

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders })
  return res.json()
}

async function sbPost(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function sbRpc(fn: string, args: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(args),
  })
  return res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })

  try {
    const body = await req.json()
    const { customer_id, qr_token, awarded_by } = body

    let finalCustomerId = customer_id

    // If QR token provided, validate and get customer_id
    if (qr_token && !customer_id) {
      const now = new Date().toISOString()
      const tokens = await sbGet(`loyalty_qr_tokens?token=eq.${qr_token}&used_at=is.null&expires_at=gt.${now}&limit=1`)

      if (!tokens?.length) {
        return new Response(JSON.stringify({ error: 'Invalid or expired QR token' }), { status: 400, headers })
      }

      // Mark token used
      await fetch(`${SUPABASE_URL}/rest/v1/loyalty_qr_tokens?token=eq.${qr_token}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ used_at: now, used_by: finalCustomerId }),
      })

      // QR tokens are shop-wide (not customer-specific), customer_id must be provided with token
      if (!body.customer_id_for_token) {
        return new Response(JSON.stringify({ error: 'customer_id required with qr_token' }), { status: 400, headers })
      }
      finalCustomerId = body.customer_id_for_token
    }

    if (!finalCustomerId) {
      return new Response(JSON.stringify({ error: 'customer_id required' }), { status: 400, headers })
    }

    // Award stamp via RPC
    const result = await sbRpc('award_loyalty_stamp', {
      p_customer_id: finalCustomerId,
      p_awarded_by: awarded_by || null,
    })

    if (result?.error) {
      return new Response(JSON.stringify({ error: result.error }), { status: 400, headers })
    }

    // If reward earned, send notification (fire and forget)
    if (result?.reward_earned) {
      fetch(`${SUPABASE_URL}/functions/v1/loyalty-notify`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reward_earned',
          customer_id: finalCustomerId,
        }),
      }).catch(() => {})
    }

    return new Response(JSON.stringify(result), { headers: { ...headers, 'Access-Control-Allow-Origin': '*' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
  }
})
