const CACHE_ORIGIN = 'https://apps.noch.cloud/api/public-menu'

export async function getSharedPublicMenu() {
  const response = await fetch(CACHE_ORIGIN + '/v1/catalog', { signal: AbortSignal.timeout(7000), cache: 'no-store' })
  if (!response.ok) throw new Error('Shared menu unavailable')
  const menu = await response.json()
  if (menu.version !== 1 || !Array.isArray(menu.products) || !Array.isArray(menu.categories)) throw new Error('Invalid shared menu')
  return menu
}
