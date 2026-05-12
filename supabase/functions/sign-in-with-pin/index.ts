// sign-in-with-pin — Exchange a PIN for a Supabase session.
// Flow:
//   1. Verify PIN via verify_pos_pin RPC (handles hashing + rate-limiting).
//   2. Generate a one-time magic-link token via admin API (no email sent).
//   3. Return { token_hash, type } so the client calls verifyOtp() to get a session.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pin, branch_id } = await req.json()

    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return new Response(
        JSON.stringify({ error: 'PIN must be 4-6 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify PIN via RPC (uses anon key — verify_pos_pin is accessible to anon)
    const anonClient = createClient(SUPABASE_URL, ANON_KEY)
    const { data: verifyResult, error: verifyError } = await anonClient.rpc('verify_pos_pin', {
      p_pin: pin,
      p_branch_id: branch_id || null,
    })

    if (verifyError) throw verifyError

    if (verifyResult?.locked) {
      const retryIn = verifyResult.retry_in_seconds || 900
      return new Response(
        JSON.stringify({
          error: `Too many failed attempts. Try again in ${Math.ceil(retryIn / 60)} minutes.`,
          locked: true,
          retry_in_seconds: retryIn,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!verifyResult?.matched) {
      return new Response(
        JSON.stringify({ error: 'Incorrect PIN' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const profileId = verifyResult.profile?.id
    if (!profileId) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use admin client to get the user's email and generate a one-time login token
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user: authUser }, error: getUserError } = await adminClient.auth.admin.getUserById(profileId)
    if (getUserError || !authUser?.email) throw getUserError || new Error('Auth user not found')

    // generateLink creates a token without sending any email
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.email,
    })
    if (linkError) throw linkError

    return new Response(
      JSON.stringify({
        token_hash: linkData.properties.hashed_token,
        type: 'email',
        profile: verifyResult.profile,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('sign-in-with-pin error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
