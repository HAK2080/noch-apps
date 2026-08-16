export const PRODUCT_MENU_BADGES = [
  { key: 'new', labelEn: 'NEW', labelAr: 'جديد', icon: '✦' },
  { key: 'limited', labelEn: 'LIMITED', labelAr: 'لفترة محدودة', icon: '⏳' },
  { key: 'back_in_stock', labelEn: 'BACK IN STOCK', labelAr: 'عاد من جديد', icon: '↺' },
  { key: 'popular', labelEn: 'POPULAR', labelAr: 'الأكثر طلباً', icon: '🔥' },
  { key: 'must_try', labelEn: 'MUST TRY', labelAr: 'لازم تجربها', icon: '★' },
]

export const PRODUCT_MENU_BADGE_ANIMATIONS = [
  { key: 'dazzle', label: 'Dazzle' },
  { key: 'shimmer', label: 'Shimmer' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'float', label: 'Float' },
]

const badgesByKey = new Map(PRODUCT_MENU_BADGES.map(badge => [badge.key, badge]))
const animationKeys = new Set(PRODUCT_MENU_BADGE_ANIMATIONS.map(animation => animation.key))

export function getProductMenuBadge(key, lang = 'en') {
  const badge = badgesByKey.get(key)
  if (!badge) return null
  return {
    ...badge,
    label: lang === 'ar' ? badge.labelAr : badge.labelEn,
  }
}

export function normalizeProductMenuBadgeAnimation(value) {
  return animationKeys.has(value) ? value : 'dazzle'
}
