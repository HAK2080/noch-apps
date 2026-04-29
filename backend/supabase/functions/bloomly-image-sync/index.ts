// bloomly-image-sync: scrape product images from bloomly.odoo.com and apply
// to matching noch pos_products that have no image yet.
//
// Strategy:
//   1. Crawl /shop pages 1..N, extract { name, image_url } per product card.
//   2. Pull pos_products without image_url.
//   3. Fuzzy match each noch name against bloomly list (Arabic-normalized, token Jaccard).
//   4. For matches with score >= 0.7: download bloomly image bytes, upload to
//      Supabase storage bucket `product-images`, set pos_products.image_url.
//   5. Return summary { matched, skipped, unsure, errors }.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BLOOMLY_BASE = 'https://bloomly.odoo.com'
const BUCKET = 'product-images'
const MATCH_THRESHOLD = 0.7

const sbHeaders = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
}

// ── String normalization (Arabic-aware) ────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')   // strip Arabic diacritics
    .replace(/[إأآا]/g, 'ا')                  // alef variants → ا
    .replace(/[ىي]/g, 'ي')                    // ya variants → ي
    .replace(/ة/g, 'ه')                       // ta marbuta → ha (heuristic)
    .replace(/[^a-z0-9؀-ۿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(t => t.length >= 2))
}

function similarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let intersect = 0
  for (const t of ta) if (tb.has(t)) intersect++
  const union = ta.size + tb.size - intersect
  return intersect / union
}

// ── Bloomly scrape ─────────────────────────────────────────────────────
type BloomlyProduct = { name: string; image_url: string; source_url: string }

async function scrapePage(page: number): Promise<BloomlyProduct[]> {
  const url = page === 1 ? `${BLOOMLY_BASE}/shop` : `${BLOOMLY_BASE}/shop/page/${page}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 noch-image-sync' } })
  if (!res.ok) return []
  const html = await res.text()
  const products: BloomlyProduct[] = []

  // Odoo product card pattern — extract via regex on the oe_product_cart structure.
  // Cards look roughly like: <a href="/shop/<slug>" ...>...<span itemprop="name">NAME</span>...
  // and an <img src="/web/image/product.product/<id>/image_1024/...">
  // Card boundary: "oe_product_cart" or "o_wsale_product_grid_wrapper"
  const cardRegex = /<(?:div|article|li)[^>]*class="[^"]*oe_product[^"]*"[\s\S]*?<\/(?:div|article|li)>/g
  let match: RegExpExecArray | null
  const fallbackBlocks: string[] = []

  while ((match = cardRegex.exec(html)) !== null) {
    fallbackBlocks.push(match[0])
  }

  const blocks = fallbackBlocks.length > 0 ? fallbackBlocks : [html]
  for (const block of blocks) {
    const nameMatch = block.match(/itemprop=["']name["'][^>]*>([^<]+)</) ||
                      block.match(/<h6[^>]*class="[^"]*o_wsale_products_item_title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)/) ||
                      block.match(/<a[^>]*class="[^"]*o_wsale_products_item_title[^"]*"[^>]*>([^<]+)/)
    const imgMatch = block.match(/<img[^>]+src=["']([^"']*\/web\/image\/product\.product\/\d+\/image_\d+[^"']*)["']/) ||
                     block.match(/data-src=["']([^"']*\/web\/image\/product\.product\/\d+\/image_\d+[^"']*)["']/)
    const linkMatch = block.match(/<a[^>]+href=["'](\/shop\/[^"']+)["']/)
    if (nameMatch && imgMatch) {
      const imgRaw = imgMatch[1]
      const image_url = imgRaw.startsWith('http') ? imgRaw : BLOOMLY_BASE + imgRaw
      const source_url = linkMatch ? BLOOMLY_BASE + linkMatch[1] : ''
      products.push({
        name: nameMatch[1].trim(),
        image_url,
        source_url,
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

// ── Image transfer ─────────────────────────────────────────────────────
async function downloadAndUpload(
  bloomlyImageUrl: string,
  productId: string,
): Promise<string> {
  const imgRes = await fetch(bloomlyImageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 noch-image-sync' } })
  if (!imgRes.ok) throw new Error(`Bloomly image fetch failed: ${imgRes.status}`)
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const bytes = new Uint8Array(await imgRes.arrayBuffer())

  const objectPath = `${productId}/bloomly-${Date.now()}.${ext}`
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`,
    {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: bytes,
    },
  )
  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`Storage upload failed: ${uploadRes.status} ${err}`)
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`

  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pos_products?id=eq.${productId}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ image_url: publicUrl }),
    },
  )
  if (!updateRes.ok) {
    const err = await updateRes.text()
    throw new Error(`Product update failed: ${updateRes.status} ${err}`)
  }
  return publicUrl
}

// ── Main ───────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const dryRun: boolean = body.dryRun === true
    const overwrite: boolean = body.overwrite === true
    const threshold: number = typeof body.threshold === 'number' ? body.threshold : MATCH_THRESHOLD

    // 1) Scrape bloomly
    const bloomly = await scrapeAll(12)
    if (bloomly.length === 0) {
      return json({ ok: false, error: 'No products scraped from bloomly — selectors may have drifted' }, 500)
    }

    // 2) Pull noch products
    const productsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pos_products?select=id,name,image_url,is_active&is_active=eq.true`,
      { headers: sbHeaders },
    )
    const products: Array<{ id: string; name: string; image_url: string | null }> = await productsRes.json()
    const candidates = overwrite ? products : products.filter(p => !p.image_url)

    // 3) Match
    type Decision = {
      product_id: string
      product_name: string
      best_match?: string
      score?: number
      action: 'apply' | 'unsure' | 'no_match' | 'error'
      result_url?: string
      error?: string
    }
    const decisions: Decision[] = []

    for (const p of candidates) {
      let bestScore = 0
      let bestItem: BloomlyProduct | null = null
      for (const b of bloomly) {
        const s = similarity(p.name, b.name)
        if (s > bestScore) {
          bestScore = s
          bestItem = b
        }
      }

      if (!bestItem || bestScore < threshold) {
        decisions.push({
          product_id: p.id,
          product_name: p.name,
          best_match: bestItem?.name,
          score: bestScore,
          action: bestScore > 0.4 ? 'unsure' : 'no_match',
        })
        continue
      }

      if (dryRun) {
        decisions.push({
          product_id: p.id,
          product_name: p.name,
          best_match: bestItem.name,
          score: bestScore,
          action: 'apply',
        })
        continue
      }

      try {
        const url = await downloadAndUpload(bestItem.image_url, p.id)
        decisions.push({
          product_id: p.id,
          product_name: p.name,
          best_match: bestItem.name,
          score: bestScore,
          action: 'apply',
          result_url: url,
        })
      } catch (err) {
        decisions.push({
          product_id: p.id,
          product_name: p.name,
          best_match: bestItem.name,
          score: bestScore,
          action: 'error',
          error: (err as Error).message,
        })
      }
    }

    const summary = {
      bloomly_scraped: bloomly.length,
      candidates: candidates.length,
      applied: decisions.filter(d => d.action === 'apply').length,
      unsure: decisions.filter(d => d.action === 'unsure').length,
      no_match: decisions.filter(d => d.action === 'no_match').length,
      errors: decisions.filter(d => d.action === 'error').length,
      dry_run: dryRun,
    }

    return json({ ok: true, summary, decisions })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
