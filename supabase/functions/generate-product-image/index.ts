import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildProductImagePrompt, normalizeProductImageBrief } from './product-image-prompt.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_ROLES = new Set(['owner', 'supervisor', 'data_entry'])
const DEFAULT_IMAGE_MODEL = 'gpt-image-2'

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const openAIKey = Deno.env.get('OPENAI_API_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'server configuration is incomplete' }, 500)
    if (!openAIKey) return json({ error: 'AI product images are not configured yet' }, 503)

    const authHeader = request.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'sign in is required' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'your session is no longer valid' }, 401)

    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profileError || !ALLOWED_ROLES.has(profile?.role)) {
      return json({ error: 'you do not have permission to generate product images' }, 403)
    }

    const brief = normalizeProductImageBrief(await request.json())
    const prompt = buildProductImagePrompt({
      name: brief.name,
      name_ar: brief.nameAr,
      description: brief.description,
      description_ar: brief.descriptionAr,
      category: brief.category,
    })
    const model = Deno.env.get('OPENAI_IMAGE_MODEL') || DEFAULT_IMAGE_MODEL

    const openAIResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: '1024x1536',
        quality: 'medium',
        output_format: 'webp',
        output_compression: 82,
        background: 'opaque',
        moderation: 'auto',
      }),
    })
    const openAIData = await openAIResponse.json()
    if (!openAIResponse.ok) {
      const message = openAIData?.error?.message || 'OpenAI could not generate this product image'
      const status = openAIResponse.status === 429 ? 429 : 502
      return json({ error: message }, status)
    }

    const imageBase64 = openAIData?.data?.[0]?.b64_json
    if (!imageBase64) return json({ error: 'OpenAI returned no product image' }, 502)

    return json({
      image_base64: imageBase64,
      mime_type: 'image/webp',
      model,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'product image generation failed'
    return json({ error: message }, 400)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
