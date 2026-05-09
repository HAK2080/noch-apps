// bloomly-import-products: scrape bloomly.odoo.com and INSERT each product
// as a pos_products row in noch (skipping names that already exist).
// Mirrors bloomly-image-sync's scraper but inserts new rows instead of
// patching existing ones.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BLOOMLY_BASE = 'https://bloomly.odoo.com'
const BUCKET = 'product-images'

const sbHeaders = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Scrape ─────────────────────────────────────────────────────────────
type BloomlyProduct = { name: string; image_url: string; price?: number; source_url: string }

async function scrapePage(page: number): Promise<BloomlyProduct[]> {
  const url = page === 1 ? `${BLOOMLY_BASE}/shop` : `${BLOOMLY_BASE}/shop/page/${page}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 noch-import' } })
  if (!res.ok) return []
  const html = await res.text()
  const products: BloomlyProduct[] = []

  const re = /class="oe_product\s+g-col-/g
  const idxs: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) idxs.push(m.index)
  const blocks: string[] = []
  for (let i = 0; i < idxs.length; i++) {
    blocks.push(html.slice(idxs[i], i + 1 < idxs.length ? idxs[i + 1] : html.length))
  }

  for (const block of blocks) {
    const titleHrefMatch = block.match(/o_wsale_products_item_title[\s\S]*?<a[^>]+href=["'](\/shop\/[^"']+)["'][\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span>/)
    const imgMatch = block.match(/<img[^>]+src=["']([^"']*\/web\/image\/product\.product\/\d+\/image_\d+[^"']*)["']/) ||
                     block.match(/<img[^>]+src=["'](\/web\/image\/[^"']*)["']/)
    // Price — look for "X.XXX ل.د" pattern or product_price span
    const priceMatch = block.match(/(\d+(?:\.\d+)?)\s*ل\.د/) ||
                       block.match(/oe_currency_value[^>]*>\s*(\d+(?:\.\d+)?)/)
    if (titleHrefMatch && imgMatch) {
      const imgRaw = imgMatch[1]
      const image_url = imgRaw.startsWith('http') ? imgRaw : BLOOMLY_BASE + imgRaw
      products.push({
        name: titleHrefMatch[2].trim(),
        image_url,
        price: priceMatch ? parseFloat(priceMatch[1]) : undefined,
        source_url: BLOOMLY_BASE + titleHrefMatch[1],
      })
    }
  }
  return products
}

async function scrapeAll(maxPages = 12): Promise<BloomlyProduct[]> {
  const all: BloomlyProduct[] = []
  const seen = new Set<string>()
  for (let p = 1; p <= maxPages; p++) {
    const items = await scrapePage(p)
    if (items.length === 0 && p > 1) break
    for (const item of items) {
      if (!seen.has(item.image_url)) {
        seen.add(item.image_url)
        all.push(item)
      }
    }
  }
  return all
}

// ── Image upload ───────────────────────────────────────────────────────
async function uploadImage(productId: string, imageUrl: string): Promise<string> {
  const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 noch-import' } })
  if (!imgRes.ok) throw new Error(`Image fetch ${imgRes.status}`)
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const bytes = new Uint8Array(await imgRes.arrayBuffer())
  const objectPath = `${productId}/bloomly-${Date.now()}.${ext}`
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!up.ok) throw new Error(`Storage ${up.status}`)
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`
}

// ── Helpers ────────────────────────────────────────────────────────────
async function ensureCategory(branchId: string, name: string): Promise<string | null> {
  const exist = await fetch(
    `${SUPABASE_URL}/rest/v1/pos_categories?branch_id=eq.${branchId}&name=eq.${encodeURIComponent(name)}&select=id&limit=1`,
    { headers: sbHeaders },
  )
  const rows = await exist.json()
  if (rows?.[0]?.id) return rows[0].id
  const create = await fetch(`${SUPABASE_URL}/rest/v1/pos_categories`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify({ branch_id: branchId, name, name_ar: 'أدوات', sort_order: 99 }),
  })
  if (!create.ok) return null
  const created = await create.json()
  return created?.[0]?.id ?? null
}

// ── Main ───────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const dryRun: boolean = body.dryRun === true
    const branchId: string | null = body.branchId ?? null
    const categoryName: string = body.categoryName ?? 'Tools'
    const visibleOnWebsite: boolean = body.visibleOnWebsite !== false
    const visibleOnMenu: boolean = body.visibleOnMenu === true

    // Resolve branch
    let resolvedBranch = branchId
    if (!resolvedBranch) {
      const br = await fetch(
        `${SUPABASE_URL}/rest/v1/pos_branches?is_active=eq.true&select=id,name&order=created_at.asc&limit=1`,
        { headers: sbHeaders },
      )
      const rows = await br.json()
      if (!rows?.[0]?.id) return json({ ok: false, error: 'No active branch' }, 400)
      resolvedBranch = rows[0].id
    }

    // 1) Scrape
    const bloomly = await scrapeAll(12)
    if (bloomly.length === 0) return json({ ok: false, error: 'Scrape returned 0 products' }, 500)

    // 2) Existing names for dedupe
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pos_products?branch_id=eq.${resolvedBranch}&select=name`,
      { headers: sbHeaders },
    )
    const existing: Array<{ name: string }> = await existingRes.json()
    const existingSet = new Set(existing.map(p => p.name.trim().toLowerCase()))

    // 3) Category
    const categoryId = await ensureCategory(resolvedBranch, categoryName)

    type Decision = {
      name: string
      action: 'imported' | 'duplicate' | 'no_price' | 'error' | 'dry_run'
      product_id?: string
      error?: string
    }
    const decisions: Decision[] = []

    for (const b of bloomly) {
      if (existingSet.has(b.name.trim().toLowerCase())) {
        decisions.push({ name: b.name, action: 'duplicate' })
        continue
      }
      if (!b.price) {
        decisions.push({ name: b.name, action: 'no_price' })
        continue
      }
      if (dryRun) {
        decisions.push({ name: b.name, action: 'dry_run' })
        continue
      }
      try {
        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/pos_products`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Prefer': 'return=representation' },
          body: JSON.stringify({
            branch_id: resolvedBranch,
            name: b.name,
            name_ar: b.name,
            price: b.price,
            cost_price: null,
            stock_qty: 0,
            track_inventory: false,
            is_active: true,
            visible_on_website: visibleOnWebsite,
            visible_on_menu: visibleOnMenu,
            category_id: categoryId,
          }),
        })
        if (!insertRes.ok) {
          const err = await insertRes.text()
          decisions.push({ name: b.name, action: 'error', error: `insert ${insertRes.status}: ${err.slice(0, 200)}` })
          continue
        }
        const created = await insertRes.json()
        const productId = created?.[0]?.id
        if (!productId) {
          decisions.push({ name: b.name, action: 'error', error: 'no id returned' })
          continue
        }
        try {
          const url = await uploadImage(productId, b.image_url)
          await fetch(`${SUPABASE_URL}/rest/v1/pos_products?id=eq.${productId}`, {
            method: 'PATCH',
            headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ image_url: url }),
          })
          decisions.push({ name: b.name, action: 'imported', product_id: productId })
        } catch (imgErr) {
          decisions.push({ name: b.name, action: 'imported', product_id: productId, error: `image: ${(imgErr as Error).message}` })
        }
      } catch (err) {
        decisions.push({ name: b.name, action: 'error', error: (err as Error).message })
      }
    }

    const summary = {
      bloomly_scraped: bloomly.length,
      imported: decisions.filter(d => d.action === 'imported').length,
      duplicates: decisions.filter(d => d.action === 'duplicate').length,
      no_price: decisions.filter(d => d.action === 'no_price').length,
      errors: decisions.filter(d => d.action === 'error').length,
      dry_run: dryRun,
      branch_id: resolvedBranch,
      category_id: categoryId,
    }

    return json({ ok: true, summary, decisions })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
