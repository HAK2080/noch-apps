const ARABIC_DIGITS = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}

const RECEIPT_WORDS = [
  'وصل', 'وصلت', 'استلمنا', 'استلمت', 'استلام', 'استلم', 'كمية', 'حبة', 'حبات', 'قطعة', 'قطع',
  'received', 'receive', 'stock', 'units', 'unit', 'items', 'item',
]

export function detectStockLanguage(text = '') {
  return /[\u0600-\u06ff]/.test(text) ? 'ar' : 'en'
}

export function normalizeDigits(text = '') {
  return String(text).replace(/[٠-٩۰-۹]/g, digit => ARABIC_DIGITS[digit] || digit)
}

export function normalizeProductText(text = '') {
  return normalizeDigits(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function parseStockReceiptMessage(text = '') {
  const language = detectStockLanguage(text)
  const normalizedDigits = normalizeDigits(text).trim()
  const quantityMatch = normalizedDigits.match(/(?:^|\s|[+,:-])(\d+(?:[.,]\d+)?)(?=\s|$|[،,.:])/)
    || normalizedDigits.match(/\d+(?:[.,]\d+)?/)

  if (!quantityMatch) {
    return { ok: false, language, error: 'missing_quantity' }
  }

  const quantity = Number(quantityMatch[1].replace(',', '.'))
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, language, error: 'invalid_quantity' }
  }

  let productQuery = normalizedDigits
    .replace(quantityMatch[0], ' ')
    .replace(/^\s*\/stock(?:@\w+)?\s*/i, '')

  for (const word of RECEIPT_WORDS) {
    productQuery = productQuery.replace(new RegExp(`(^|\\s)${word}(?=\\s|$)`, 'giu'), ' ')
  }

  productQuery = productQuery
    .replace(/[+,:،.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!productQuery) {
    return { ok: false, language, error: 'missing_product' }
  }

  return { ok: true, language, quantity, productQuery }
}

function productNames(product) {
  return [product.name, product.name_ar]
    .filter(Boolean)
    .map(normalizeProductText)
    .filter(Boolean)
}

export function findStockProductCandidates(products = [], query = '') {
  const target = normalizeProductText(query)
  if (!target) return []

  const ranked = products.map(product => {
    const names = productNames(product)
    let score = 0
    for (const name of names) {
      if (name === target) score = Math.max(score, 100)
      else if (name.startsWith(target) || target.startsWith(name)) score = Math.max(score, 80)
      else if (name.includes(target) || target.includes(name)) score = Math.max(score, 60)
      else {
        const targetTokens = target.split(' ')
        const nameTokens = new Set(name.split(' '))
        const overlap = targetTokens.filter(token => nameTokens.has(token)).length
        if (overlap) score = Math.max(score, 20 + overlap * 10)
      }
    }
    return { product, score }
  }).filter(match => match.score > 0)

  ranked.sort((a, b) => b.score - a.score || String(a.product.name).localeCompare(String(b.product.name)))

  const exact = ranked.filter(match => match.score === 100)
  if (exact.length === 1) return exact

  const strongest = ranked[0]?.score || 0
  if (strongest >= 80 && ranked.filter(match => match.score === strongest).length === 1) {
    return [ranked[0]]
  }

  return ranked.slice(0, 6)
}
