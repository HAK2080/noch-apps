import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'

const ORIGIN = 'https://kxqjasdvoohiexedtfqw.supabase.co'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REF = /^[a-z0-9][a-z0-9-]{0,79}$/i
const PRODUCT_MEDIA = /^(?:products\/)?[0-9a-f-]{36}\/[a-z0-9._-]+\.(?:webp|png|jpe?g|mp4|webm)$/i
const CATEGORY_MEDIA = /^category-icons\/cat_\d+\.(?:webp|png|jpe?g)$/i
const BRANCH_FIELDS = 'id,name,lat,lng,geofence_radius_m'
const CATEGORY_FIELDS = 'id,name,name_ar,customer_menu_name,customer_menu_name_ar,color,image_url,sort_order,menu_display_style,show_on_website'
const PRODUCT_FIELDS = 'id,name,name_ar,price,image_url,video_url,category_id,secondary_category_ids,menu_description,menu_description_ar,show_description_on_menu,menu_badge_key,menu_badge_animation,featured,is_available'
const CATALOG_FIELDS = 'id,name,name_ar,price,description,menu_description,menu_description_ar,show_description_on_website,visible_on_website,category_id,image_url,video_url'

export function createPublicMenuService({ anonKey, fetchImpl = fetch, now = Date.now, ttl = 60000 } = {}) {
  const entries = new Map()
  const pending = new Map()
  const stats = { hits: 0, misses: 0, origin_requests: 0, invalidations: 0, media_r2_requests: 0, media_origin_requests: 0 }
  let generation = 0

  function json(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), { status, headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Expose-Headers': 'X-Noch-Menu-Cache, Age',
      'Cache-Control': 'no-store',
      ...headers,
    } })
  }

  async function query(path, params, body, bearer = anonKey) {
    if (!anonKey) throw Object.assign(new Error('Cache not configured'), { status: 503 })
    stats.origin_requests++
    const url = new URL('/rest/v1/' + path, ORIGIN)
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value)
    const response = await fetchImpl(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) throw Object.assign(new Error('Menu source unavailable'), { status: 502 })
    return response.json()
  }

  async function load(ref) {
    const global = ref === 'catalog'
    let branch = null
    if (!global) {
      const branches = await query('pos_branches', {
        select: BRANCH_FIELDS, is_active: 'eq.true',
        [UUID.test(ref) ? 'id' : 'slug']: (UUID.test(ref) ? 'eq.' : 'ilike.') + ref,
      })
      if (!Array.isArray(branches) || branches.length !== 1) throw Object.assign(new Error('Branch not found'), { status: 404 })
      branch = branches[0]
    }
    const categoryQuery = { select: global ? 'id,name,name_ar' : CATEGORY_FIELDS, is_active: 'eq.true', show_on_website: 'eq.true', order: global ? 'sort_order.asc' : 'sort_order.asc,name.asc' }
    const productQuery = { select: global ? CATALOG_FIELDS : PRODUCT_FIELDS, is_active: 'eq.true', visible_on_customer_menu: 'eq.true', is_sold_out: 'not.is.true', order: global ? 'name.asc' : 'menu_sort.asc,name.asc' }
    if (branch) {
      categoryQuery.or = `(visible_branch_ids.cs.{${branch.id}},branch_id.eq.${branch.id})`
      productQuery.or = `(visible_branch_ids.cs.{${branch.id}},branch_id.eq.${branch.id},branch_id.is.null)`
    }
    const [categories, products, availability] = await Promise.all([
      query('pos_categories', categoryQuery), query('pos_products', productQuery),
      query('rpc/get_customer_sale_availability', {}, { p_branch: branch?.id || null }),
    ])
    if (![categories, products, availability].every(Array.isArray)) throw new Error('Invalid menu source')
    const available = new Set(availability.filter(item => item.available).map(item => item.product_id))
    return { version: 1, branch, categories, products: products.filter(product => product.is_available !== false && available.has(product.id)), generated_at: new Date(now()).toISOString() }
  }

  async function authorize(request) {
    const bearer = request.headers.get('Authorization')?.replace(/^Bearer /i, '')
    if (!bearer || bearer === anonKey) return false
    try {
      const profiles = await query('rpc/my_profile_v2', { select: 'id,role,access_enabled' }, {}, bearer)
      const profile = profiles?.[0]
      if (!profile?.id || profile.access_enabled === false) return false
      if (profile.role === 'owner') return true
      const grants = await query('role_permissions', { select: 'feature,can_edit', role: `eq.${profile.role}`, feature: 'in.(pos,products)' }, undefined, bearer)
      return grants.some(grant => grant.can_edit === true)
    } catch { return false }
  }

  async function handle(request) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return json(null, 200)
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, cache_seconds: ttl / 1000, entries: entries.size, ...stats })
    if (url.pathname.startsWith('/media/') && ['GET', 'HEAD'].includes(request.method)) {
      const key = url.pathname.slice('/media/'.length)
      if ((!PRODUCT_MEDIA.test(key) && !CATEGORY_MEDIA.test(key)) || key.includes('..')) return json({ error: 'Not found' }, 404)
      const r2Supported = key.startsWith('products/')
      let response
      let source = 'R2'
      try {
        if (r2Supported) {
          stats.media_r2_requests++
          response = await fetchImpl('https://noch-menu-media.2080testing.workers.dev/' + key, {
            method: request.method, headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(15000),
          })
        }
      } catch { /* Use the preserved public original during a media service outage. */ }
      if (!response || response.status >= 500 || response.status === 429) {
        const category = CATEGORY_MEDIA.test(key)
        const path = category ? 'staff-photos/' + key.slice('category-icons/'.length) : 'product-images/' + key
        stats.media_origin_requests++
        source = 'origin-fallback'
        response = await fetchImpl(ORIGIN + '/storage/v1/object/public/' + path, {
          method: request.method, headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(15000),
        })
      }
      const type = response.headers.get('Content-Type') || ''
      if (!response.ok || !/^(image\/(?:webp|png|jpeg)|video\/(?:mp4|webm))\b/i.test(type)) {
        const missing = response.status === 404 || response.status === 400
        return json({ error: 'Media unavailable' }, missing ? 404 : 502, missing ? { 'Cache-Control': 'public, max-age=300' } : {})
      }
      // Public bytes only: never relay origin cookies or per-request gateway headers.
      // Set-Cookie also prevents nginx retaining an otherwise immutable object.
      const headers = new Headers()
      for (const name of ['Content-Type', 'Content-Length', 'ETag', 'Last-Modified', 'Accept-Ranges', 'Content-Range']) {
        const value = response.headers.get(name)
        if (value) headers.set(name, value)
      }
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      headers.set('X-Noch-Media-Source', source)
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers })
    }
    if (url.pathname === '/v1/invalidate' && request.method === 'POST') {
      if (!await authorize(request)) return json({ error: 'Not authorized' }, 403)
      generation++
      entries.clear()
      pending.clear()
      stats.invalidations++
      return json({ ok: true })
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    const match = /^\/v1\/branches\/([^/]+)$/.exec(url.pathname)
    const ref = url.pathname === '/v1/catalog' ? 'catalog' : match?.[1]?.toLowerCase()
    if (!ref || !REF.test(ref)) return json({ error: 'Not found' }, 404)
    let cached = entries.get(ref)
    if (cached && now() - cached.at < ttl) {
      stats.hits++
      return json(cached.body, 200, { 'X-Noch-Menu-Cache': 'HIT', Age: String(Math.floor((now() - cached.at) / 1000)) })
    }
    stats.misses++
    if (!pending.has(ref)) {
      if (pending.size >= 64) return json({ error: 'Menu temporarily busy' }, 503)
      const startedGeneration = generation
      const promise = load(ref).then(body => {
        if (startedGeneration === generation) {
          if (entries.size >= 64) entries.delete(entries.keys().next().value)
          entries.set(ref, { body, at: now() })
        }
        return body
      }).finally(() => { if (pending.get(ref) === promise) pending.delete(ref) })
      pending.set(ref, promise)
    }
    try {
      const body = await pending.get(ref)
      return json(body, 200, { 'X-Noch-Menu-Cache': 'MISS', Age: '0' })
    } catch (error) {
      // An explicit closed/missing branch is never served from an older snapshot.
      if (cached && error.status !== 404 && now() - cached.at < 300000) {
        return json(cached.body, 200, { 'X-Noch-Menu-Cache': 'STALE', Age: String(Math.floor((now() - cached.at) / 1000)) })
      }
      return json({ error: error.status === 404 ? 'Branch not found' : 'Menu temporarily unavailable' }, error.status || 502)
    }
  }
  return { handle, stats }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = createPublicMenuService({ anonKey: process.env.SUPABASE_ANON_KEY })
  const server = createServer(async (req, res) => {
    try {
      const response = await service.handle(new Request(`http://menu-cache${req.url}`, { method: req.method, headers: req.headers }))
      res.writeHead(response.status, Object.fromEntries(response.headers))
      if (response.body) Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res)
      else res.end()
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end('{"error":"Menu temporarily unavailable"}')
    }
  })
  server.listen(Number(process.env.PORT || 8788), '0.0.0.0')
}
