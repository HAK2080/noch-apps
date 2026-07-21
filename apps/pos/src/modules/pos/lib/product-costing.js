import { getStockBaseUnit, toBaseQuantity } from './inventory-units.js'

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function createBlankCostComponent() {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `new-${Date.now()}`,
    inventory_product_id: '',
    custom_name: '',
    quantity: '1',
    unit: 'pc',
    manual_unit_cost_lyd: '',
  }
}

export function resolveCostComponent(component, inventoryProduct) {
  const quantity = optionalNumber(component.quantity)
  const automaticBaseCost = optionalNumber(inventoryProduct?.stock_cost_per_base_unit)
  const manualUnitCost = optionalNumber(component.manual_unit_cost_lyd)
  const hasAutomaticCost = automaticBaseCost !== null && automaticBaseCost > 0
  const hasManualCost = manualUnitCost !== null && manualUnitCost >= 0
  const validQuantity = quantity !== null && quantity > 0

  let source = 'missing'
  let unitCost = null
  let lineCost = null

  if (validQuantity && hasAutomaticCost) {
    source = 'automatic'
    unitCost = automaticBaseCost * toBaseQuantity(1, component.unit)
    lineCost = automaticBaseCost * toBaseQuantity(quantity, component.unit)
  } else if (validQuantity && hasManualCost) {
    source = 'manual'
    unitCost = manualUnitCost
    lineCost = quantity * manualUnitCost
  }

  return {
    ...component,
    name: inventoryProduct?.name || component.custom_name?.trim() || 'Unnamed ingredient',
    baseUnit: getStockBaseUnit(component.unit),
    source,
    unitCost,
    lineCost,
    complete: validQuantity && lineCost !== null,
  }
}

export function calculateProductCost({
  components = [],
  inventoryProducts = [],
  coffeeGrams,
  coffeeBeanProductId,
  manualProductCost,
}) {
  const productMap = new Map(inventoryProducts.map(product => [product.id, product]))
  const resolvedComponents = components.map(component =>
    resolveCostComponent(component, productMap.get(component.inventory_product_id))
  )

  const grams = optionalNumber(coffeeGrams)
  const coffeeProduct = productMap.get(coffeeBeanProductId)
  const coffeeBaseCost = optionalNumber(coffeeProduct?.stock_cost_per_base_unit)
  const hasCoffee = grams !== null && grams > 0
  const coffeeLine = hasCoffee
    ? {
        name: coffeeProduct?.name || 'Coffee beans',
        quantity: grams,
        unit: 'g',
        source: coffeeBaseCost !== null && coffeeBaseCost > 0 ? 'automatic' : 'missing',
        lineCost: coffeeBaseCost !== null && coffeeBaseCost > 0 ? grams * coffeeBaseCost : null,
        complete: coffeeBaseCost !== null && coffeeBaseCost > 0,
      }
    : null

  const compositionLines = coffeeLine ? [coffeeLine, ...resolvedComponents] : resolvedComponents
  const hasComposition = compositionLines.length > 0
  const incompleteLines = compositionLines.filter(line => !line.complete)
  const calculatedCost = incompleteLines.length === 0 && hasComposition
    ? compositionLines.reduce((sum, line) => sum + line.lineCost, 0)
    : null
  const manualCost = optionalNumber(manualProductCost)

  return {
    components: resolvedComponents,
    coffeeLine,
    hasComposition,
    complete: incompleteLines.length === 0,
    incompleteLines,
    calculatedCost,
    effectiveCost: calculatedCost ?? (!hasComposition && manualCost !== null ? manualCost : null),
    source: calculatedCost !== null ? 'automatic' : (!hasComposition && manualCost !== null ? 'manual' : 'incomplete'),
  }
}

export function serializeCostComponents(components) {
  return components.map((component, index) => ({
    inventory_product_id: component.inventory_product_id || null,
    custom_name: component.inventory_product_id ? null : component.custom_name?.trim() || null,
    quantity: Number(component.quantity),
    unit: component.unit,
    manual_unit_cost_lyd:
      component.manual_unit_cost_lyd === '' || component.manual_unit_cost_lyd === null
        ? null
        : Number(component.manual_unit_cost_lyd),
    sort_order: index,
  }))
}
