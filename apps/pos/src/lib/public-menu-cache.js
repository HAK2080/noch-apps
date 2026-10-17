const CACHE_ORIGIN = 'https://apps.noch.cloud/api/public-menu'

export async function getSharedPublicMenu(branchRef) {
  const path = branchRef ? `/v1/branches/${encodeURIComponent(branchRef)}` : '/v1/catalog'
  const response = await fetch(CACHE_ORIGIN + path, { signal: AbortSignal.timeout(7000), cache: 'no-store' })
  if (!response.ok) throw new Error('Shared menu unavailable')
  const menu = await response.json()
  if (menu.version !== 1 || !Array.isArray(menu.products) || !Array.isArray(menu.categories) || (branchRef && !menu.branch?.id)) throw new Error('Invalid shared menu')
  return menu
}

let invalidateTimer
export function schedulePublicMenuRefresh(input, init, response) {
  if (!response.ok || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(init?.method?.toUpperCase())) return
  let path
  try { path = new URL(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url).pathname } catch { return }
  if (!/^\/rest\/v1\/(?:pos_products|pos_categories|pos_branches)(?:\/|$)/.test(path)
    && !/^\/rest\/v1\/rpc\/(?:set_global_stock_block|receive_product_stock)$/.test(path)) return
  const authorization = new Headers(init?.headers).get('Authorization')
  if (!authorization) return
  clearTimeout(invalidateTimer)
  invalidateTimer = setTimeout(() => {
    fetch(CACHE_ORIGIN + '/v1/invalidate', {
      method: 'POST', headers: { Authorization: authorization }, signal: AbortSignal.timeout(4000),
    }).catch(() => {})
  }, 300)
}
