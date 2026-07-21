export const COFFEE_GRAM_PRESETS = [
  { value: 9, label: 'Single shot' },
  { value: 18, label: 'Double shot' },
  { value: 27, label: '3 shots' },
  { value: 20, label: 'V60' },
]

export function normalizeCoffeeGrams(value) {
  if (value === '' || value === null || value === undefined) return null
  const grams = Number(value)
  return Number.isFinite(grams) && grams > 0 ? grams : null
}

export function calculateCoffeeStockCost(costPerGram, grams) {
  const unitCost = Number(costPerGram)
  const quantity = Number(grams)
  if (!Number.isFinite(unitCost) || !Number.isFinite(quantity) || unitCost < 0 || quantity < 0) return null
  return unitCost * quantity
}

export function calculateRetailCoffeeCost(costPerGram, packGrams = 250) {
  const cost = calculateCoffeeStockCost(costPerGram, packGrams)
  return cost === null ? null : Math.round((cost + Number.EPSILON) * 100) / 100
}
