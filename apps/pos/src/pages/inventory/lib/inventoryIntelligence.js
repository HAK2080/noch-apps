const STATUS_RANK = {
  out: 0,
  below_minimum: 1,
  near_minimum: 2,
  unconfigured: 3,
  healthy: 4,
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeInventoryControlRow(row = {}) {
  const countedQty = finiteNumber(row.counted_qty)
  const recipeUsageAvailable = row.recipe_usage_status === 'available'
  const consumedSinceCount = recipeUsageAvailable
    ? Math.max(0, finiteNumber(row.consumed_since_count))
    : null
  const theoreticalQty = recipeUsageAvailable
    ? finiteNumber(row.theoretical_qty, countedQty)
    : null
  const decisionQty = theoreticalQty ?? countedQty
  const minThreshold = Math.max(0, finiteNumber(row.min_threshold))
  const thresholdConfigured = minThreshold > 0

  let status = 'healthy'
  if (decisionQty <= 0) status = 'out'
  else if (!thresholdConfigured) status = 'unconfigured'
  else if (decisionQty <= minThreshold) status = 'below_minimum'
  else if (decisionQty <= minThreshold * 1.5) status = 'near_minimum'

  return {
    ingredientId: row.ingredient_id || null,
    name: row.ingredient_name || 'Unnamed ingredient',
    nameAr: row.ingredient_name_ar || '',
    unit: row.unit || '',
    countedQty,
    consumedSinceCount,
    theoreticalQty,
    decisionQty,
    minThreshold,
    thresholdConfigured,
    lastCountedAt: row.last_counted_at || null,
    countIsStale: row.count_is_stale !== false,
    recipeUsageAvailable,
    recipeCount: Math.max(0, finiteNumber(row.recipe_count)),
    locationCount: Math.max(0, finiteNumber(row.location_count)),
    locationQty: Math.max(0, finiteNumber(row.location_qty)),
    locationVariance: row.location_variance == null
      ? null
      : finiteNumber(row.location_variance),
    status,
  }
}

export function buildInventoryControlReport(sourceRows = []) {
  const rows = sourceRows
    .map(normalizeInventoryControlRow)
    .sort((left, right) => (
      STATUS_RANK[left.status] - STATUS_RANK[right.status]
      || left.decisionQty - right.decisionQty
      || left.name.localeCompare(right.name)
    ))

  const statusCounts = {
    out: 0,
    below_minimum: 0,
    near_minimum: 0,
    unconfigured: 0,
    healthy: 0,
  }

  for (const row of rows) statusCounts[row.status] += 1

  const configuredCount = rows.filter(row => row.thresholdConfigured).length
  const healthyConfiguredCount = rows.filter(
    row => row.thresholdConfigured && row.status === 'healthy',
  ).length
  const staleCount = rows.filter(row => row.countIsStale).length
  const recipeUsageUnavailableCount = rows.filter(
    row => !row.recipeUsageAvailable,
  ).length
  const missingLocationCount = rows.filter(row => row.locationCount === 0).length
  const locationVarianceCount = rows.filter(
    row => row.locationVariance != null && Math.abs(row.locationVariance) > 0.001,
  ).length

  return {
    rows,
    total: rows.length,
    statusCounts,
    configuredCount,
    staleCount,
    recipeUsageUnavailableCount,
    missingLocationCount,
    locationVarianceCount,
    thresholdCoveragePct: rows.length
      ? Math.round((configuredCount / rows.length) * 100)
      : null,
    healthyConfiguredPct: configuredCount
      ? Math.round((healthyConfiguredCount / configuredCount) * 100)
      : null,
  }
}

export function inventoryControlExportRows(rows = []) {
  return rows.map(row => [
    row.name,
    row.status,
    row.countedQty,
    row.recipeUsageAvailable ? row.consumedSinceCount : '',
    row.recipeUsageAvailable ? row.theoreticalQty : '',
    row.recipeUsageAvailable ? 'available' : 'unavailable',
    row.minThreshold,
    row.thresholdConfigured ? 'yes' : 'no',
    row.countIsStale ? 'stale' : 'current',
    row.lastCountedAt || '',
    row.locationCount,
    row.locationQty,
    row.locationVariance ?? '',
    row.unit,
  ])
}
