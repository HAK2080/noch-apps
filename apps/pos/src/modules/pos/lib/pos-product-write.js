const READ_ONLY_PRODUCT_FIELDS = new Set([
  'pos_categories',
  'pos_branches',
  'stock_location_id',
  'stock_updated_at',
  'stock_source',
])

export function toPOSProductWrite(product) {
  return Object.fromEntries(
    Object.entries(product).filter(([key]) => !READ_ONLY_PRODUCT_FIELDS.has(key)),
  )
}
