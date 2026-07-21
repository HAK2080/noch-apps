const UNIT_DEFINITIONS = {
  pc: { value: 'pc', label: 'Pieces', shortLabel: 'pcs', baseUnit: 'pc', factor: 1 },
  g: { value: 'g', label: 'Grams', shortLabel: 'g', baseUnit: 'g', factor: 1 },
  kg: { value: 'kg', label: 'Kilograms', shortLabel: 'kg', baseUnit: 'g', factor: 1000 },
  ml: { value: 'ml', label: 'Millilitres', shortLabel: 'ml', baseUnit: 'ml', factor: 1 },
  l: { value: 'l', label: 'Litres', shortLabel: 'L', baseUnit: 'ml', factor: 1000 },
}

export const STOCK_UNIT_OPTIONS = Object.values(UNIT_DEFINITIONS)

export function normalizeStockUnit(unit, fallback = 'pc') {
  const normalized = String(unit || '').trim().toLowerCase()
  return UNIT_DEFINITIONS[normalized] ? normalized : fallback
}

export function getStockBaseUnit(unit) {
  return UNIT_DEFINITIONS[normalizeStockUnit(unit)].baseUnit
}

export function getCompatibleStockUnits(baseUnit, allowAll = false) {
  if (allowAll) return STOCK_UNIT_OPTIONS
  const normalizedBase = getStockBaseUnit(baseUnit)
  return STOCK_UNIT_OPTIONS.filter(option => option.baseUnit === normalizedBase)
}

export function toBaseQuantity(quantity, unit) {
  const numeric = Number(quantity)
  if (!Number.isFinite(numeric)) return 0
  return numeric * UNIT_DEFINITIONS[normalizeStockUnit(unit)].factor
}

export function fromBaseQuantity(quantity, displayUnit) {
  const numeric = Number(quantity)
  if (!Number.isFinite(numeric)) return 0
  return numeric / UNIT_DEFINITIONS[normalizeStockUnit(displayUnit)].factor
}

export function convertDisplayedQuantity(quantity, fromUnit, toUnit) {
  if (getStockBaseUnit(fromUnit) !== getStockBaseUnit(toUnit)) return quantity
  return fromBaseQuantity(toBaseQuantity(quantity, fromUnit), toUnit)
}

export function formatQuantityValue(value) {
  const quantity = Number(value) || 0
  if (Number.isInteger(quantity)) return String(quantity)
  return quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

export function formatStockQuantity(baseQuantity, displayUnit = 'pc') {
  const unit = normalizeStockUnit(displayUnit)
  const displayQuantity = fromBaseQuantity(baseQuantity, unit)
  return `${formatQuantityValue(displayQuantity)} ${UNIT_DEFINITIONS[unit].shortLabel}`
}

export function quickQuantitiesForUnit(unit) {
  const normalized = normalizeStockUnit(unit)
  if (normalized === 'g' || normalized === 'ml') return [100, 250, 500, 1000]
  if (normalized === 'kg' || normalized === 'l') return [0.25, 0.5, 1, 5]
  return [1, 6, 12, 24]
}
