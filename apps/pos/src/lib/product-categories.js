function cleanCategoryId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeProductCategorySelection(primaryCategoryId, secondaryCategoryIds = []) {
  const categoryId = cleanCategoryId(primaryCategoryId)
  const secondaryIds = Array.isArray(secondaryCategoryIds) ? secondaryCategoryIds : []
  const seen = new Set(categoryId ? [categoryId] : [])
  const normalizedSecondaryIds = []

  for (const value of secondaryIds) {
    const id = cleanCategoryId(value)
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalizedSecondaryIds.push(id)
  }

  return {
    category_id: categoryId,
    secondary_category_ids: normalizedSecondaryIds,
  }
}

export function getProductCategoryIds(product = {}) {
  const normalized = normalizeProductCategorySelection(
    product.category_id,
    product.secondary_category_ids,
  )
  return [normalized.category_id, ...normalized.secondary_category_ids].filter(Boolean)
}

export function productBelongsToCategory(product, categoryId) {
  const id = cleanCategoryId(categoryId)
  return !!id && getProductCategoryIds(product).includes(id)
}

export function changeProductPrimaryCategory(product = {}, nextPrimaryCategoryId) {
  const nextPrimary = cleanCategoryId(nextPrimaryCategoryId)
  if (!nextPrimary) return { category_id: '', secondary_category_ids: [] }

  const existingIds = getProductCategoryIds(product)
  return normalizeProductCategorySelection(
    nextPrimary,
    existingIds.filter(id => id !== nextPrimary),
  )
}

