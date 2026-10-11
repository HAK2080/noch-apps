// Explicit retail field allowlist: no inventory counts, cost or credentials.
export function validateCatalogImport(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('Provide 1–500 product rows')
  const seen = new Set()
  return rows.map(row => {
    const sku = String(row.sku || '').trim()
    if (!sku || seen.has(sku.toLowerCase())) throw new Error(`Missing or duplicate SKU: ${sku}`)
    seen.add(sku.toLowerCase())
    if (row.patch) {
      if (!/^[a-f0-9-]{36}$/i.test(row.match_product_id || '')) throw new Error(`${sku}: verified existing product ID required for corrections`)
      if (typeof row.patch !== 'object' || Array.isArray(row.patch)) throw new Error(`${sku}: invalid correction`)
      const allowed = ['name', 'name_ar', 'visible_on_website']
      if (!Object.keys(row.patch).length || Object.keys(row.patch).some(k => !allowed.includes(k))) throw new Error(`${sku}: unsupported correction field`)
      for (const key of ['name', 'name_ar']) if (key in row.patch && (typeof row.patch[key] !== 'string' || !row.patch[key].trim())) throw new Error(`${sku}: invalid ${key}`)
      if ('visible_on_website' in row.patch && typeof row.patch.visible_on_website !== 'boolean') throw new Error(`${sku}: invalid visibility`)
      if (row.photo_data && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(row.photo_data) || !Array.isArray(row.source_urls) || !row.source_urls.length || row.source_urls.some(u => !/^https:\/\//.test(u)))) throw new Error(`${sku}: sourced product photo required`)
      return { sku, patch: row.patch, match_product_id: row.match_product_id, aliases: [], name: row.patch.name, photo_data: row.photo_data, source_urls: row.source_urls }
    }
    if (typeof row.available !== 'boolean') throw new Error(`${sku}: availability required`)
    if (!Array.isArray(row.aliases || []) || (row.aliases || []).some(x => typeof x !== 'string')) throw new Error(`${sku}: invalid aliases`)
    if (row.match_product_id && !/^[a-f0-9-]{36}$/i.test(row.match_product_id)) throw new Error(`${sku}: invalid existing product ID`)
    if (!row.available) return { sku, available: false, aliases: row.aliases || [], match_product_id: row.match_product_id }
    const sale = Number(row.sheet_sale_lyd), wholesale = Number(row.wholesale_usd)
    if (!(sale > 0) || !(wholesale > 0) || !Number.isFinite(sale + wholesale)) throw new Error(`${sku}: positive source prices required`)
    if (![row.name, row.name_ar, row.description_en, row.description_ar].every(v => typeof v === 'string' && v.trim())) throw new Error(`${sku}: bilingual name and description required`)
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(row.photo_data || '')) throw new Error(`${sku}: actual product photo required`)
    if (!Array.isArray(row.source_urls) || !row.source_urls.length || row.source_urls.some(u => !/^https:\/\//.test(u))) throw new Error(`${sku}: source URLs required`)
    return { sku, available: true, aliases: row.aliases || [], match_product_id: row.match_product_id, name: row.name.trim(), name_ar: row.name_ar.trim(), description_en: row.description_en.trim(), description_ar: row.description_ar.trim(), photo_data: row.photo_data, price: Math.ceil(Math.max(sale, wholesale * 10) / 5) * 5, source_urls: row.source_urls }
  })
}
const normalized = value => String(value || '').trim().toLowerCase()
export function planCatalogImport(rows, products) {
  const used = new Set()
  return rows.map(row => {
    let matches = row.match_product_id ? products.filter(p => p.id === row.match_product_id) : products.filter(p => normalized(p.sku) === normalized(row.sku))
    if (row.match_product_id && !matches.length) throw new Error(`${row.sku}: existing product ID no longer exists`)
    if (!matches.length) {
      const names = [row.name, ...row.aliases].map(normalized).filter(Boolean)
      matches = products.filter(p => names.includes(normalized(p.name)))
    }
    if (matches.length > 1) throw new Error(`${row.sku}: ambiguous match (${matches.map(p => p.name).join(', ')})`)
    const existing = matches[0]
    if (existing && used.has(existing.id)) throw new Error(`${row.sku}: another row targets the same product`)
    if (existing) used.add(existing.id)
    return { row, existing, action: row.patch ? 'Correct' : existing ? (row.available ? 'Update' : 'Hide') : (row.available ? 'Add' : 'Skip') }
  })
}
export function catalogImportPayload(row, existing, branchId, categoryId) {
  if (row.patch) return { ...row.patch }
  if (!row.available) return { visible_on_website: false, visible_on_customer_menu: false }
  return {
    ...(!existing ? { branch_id: branchId, stock_qty: 0, stock_base_unit: 'pc', stock_display_unit: 'pc' } : {}),
    track_inventory: false,
    sku: row.sku, name: row.name, name_ar: row.name_ar, price: row.price,
    description: row.description_en, menu_description: row.description_en, menu_description_ar: row.description_ar,
    show_description_on_website: true, show_description_on_menu: true,
    category_id: categoryId, visible_on_website: true, visible_on_customer_menu: false, visible_on_menu: true,
    is_active: true, is_available: true, is_sold_out: false,
  }
}
