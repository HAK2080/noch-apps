const SOURCE_PREFIX = 'https://kxqjasdvoohiexedtfqw.supabase.co/storage/v1/object/public/product-images/'
const PRODUCT_KEY = /^products\/[0-9a-f-]{36}\/[a-z0-9._-]+\.(?:webp|png|jpe?g|mp4|webm)$/i
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

function responseFromObject(object, method, request) {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', CACHE_CONTROL)
  headers.set('ETag', object.httpEtag)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Access-Control-Allow-Origin', '*')

  if (request.headers.get('If-None-Match') === object.httpEtag) {
    return new Response(null, { status: 304, headers })
  }

  let status = 200
  if (object.range && request.headers.has('Range')) {
    const offset = object.range.offset ?? object.size - object.range.suffix
    const length = object.range.length ?? object.range.suffix
    headers.set('Content-Range', 'bytes ' + offset + '-' + (offset + length - 1) + '/' + object.size)
    headers.set('Content-Length', String(length))
    status = 206
  } else {
    headers.set('Content-Length', String(object.size))
  }
  return new Response(method === 'HEAD' ? null : object.body, { status, headers })
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }

    const path = new URL(request.url).pathname
    if (path === '/health') return new Response('ok')

    let key
    try {
      key = decodeURIComponent(path.slice(1))
    } catch {
      return new Response('Invalid path', { status: 400 })
    }
    if (!PRODUCT_KEY.test(key) || key.includes('..')) {
      return new Response('Not found', { status: 404 })
    }

    const range = request.headers.has('Range') ? request.headers : undefined
    let object = await env.MEDIA_BUCKET.get(key, range ? { range } : undefined)
    if (object?.body) return responseFromObject(object, request.method, request)

    const source = new URL(key.split('/').map(encodeURIComponent).join('/'), SOURCE_PREFIX)
    const origin = await fetch(source, { method: request.method === 'HEAD' ? 'HEAD' : 'GET' })
    if (!origin.ok) {
      return new Response('Source file unavailable', {
        status: origin.status === 400 || origin.status === 404 ? 404 : 502,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    const type = origin.headers.get('Content-Type') || 'application/octet-stream'
    if (!/^(image\/(?:webp|png|jpeg)|video\/(?:mp4|webm))\b/i.test(type)) {
      return new Response('Unsupported media type', { status: 502 })
    }
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } })
    }

    const bytes = await origin.arrayBuffer()
    if (bytes.byteLength > 25 * 1024 * 1024) return new Response('Media too large', { status: 502 })

    try {
      await env.MEDIA_BUCKET.put(key, bytes, {
        httpMetadata: { contentType: type, cacheControl: CACHE_CONTROL },
      })
      object = await env.MEDIA_BUCKET.get(key, range ? { range } : undefined)
      if (object?.body) return responseFromObject(object, request.method, request)
    } catch {
      // A simultaneous first request may have written the same object already.
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    })
  },
}
