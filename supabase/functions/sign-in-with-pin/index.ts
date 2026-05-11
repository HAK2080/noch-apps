import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pin } = await req.json()
    if (!pin || pin.length < 4 || pin.length > 6) {
      return new Response(
        JSON.stringify({ error: 'PIN must be 4-6 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Call verify_pos_pin RPC function to validate PIN
    // This handles SHA256 hashing and rate limiting
    const { data: verifyResult, error: verifyError } = await supabase
      .rpc('verify_pos_pin', { p_pin: pin })

    if (verifyError) {
      console.error('PIN verification error:', verifyError)
      return new Response(
        JSON.stringify({ error: 'PIN verification failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check verification result
    if (!verifyResult?.matched) {
      if (verifyResult?.locked) {
        const retryIn = verifyResult.retry_in_seconds || 900
        return new Response(
          JSON.stringify({
            error: 'Too many failed attempts. Please try again later.',
            locked: true,
            retry_in_seconds: retryIn
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ error: 'Invalid PIN' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const profileData = verifyResult.profile
    if (!profileData || !profileData.id) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate a session token for this user using admin API
    const { data: { session }, error: sessionError } = await supabase.auth.admin.createSession({
      user_id: profileData.id,
    })

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: sessionError?.message || 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        user: { id: profileData.id, email: profileData.id },
        session,
        message: `Logged in as ${profileData.full_name}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
