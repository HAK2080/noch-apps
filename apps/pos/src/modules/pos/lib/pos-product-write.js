const READ_ONLY_PRODUCT_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'pos_categories',
  'pos_branches',
  'stock_location_id',
  'stock_updated_at',
  'stock_source',
  // Calculated by get_sale_availability for the POS; not pos_products columns.
  'sale_blocked',
  'sale_block_reason',
])

export function toPOSProductWrite(product) {
  return Object.fromEntries(
    Object.entries(product).filter(([key]) => !READ_ONLY_PRODUCT_FIELDS.has(key)),
  )
}
