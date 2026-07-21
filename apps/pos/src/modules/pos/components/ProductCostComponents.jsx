import { Plus, Trash2 } from 'lucide-react'
import {
  STOCK_UNIT_OPTIONS,
  getCompatibleStockUnits,
  getStockBaseUnit,
} from '../lib/inventory-units'
import {
  calculateProductCost,
  createBlankCostComponent,
} from '../lib/product-costing'

function money(value) {
  return Number(value || 0).toFixed(3)
}

export default function ProductCostComponents({
  components,
  onChange,
  inventoryProducts,
  coffeeGrams,
  coffeeBeanProductId,
  manualProductCost,
}) {
  const calculation = calculateProductCost({
    components,
    inventoryProducts,
    coffeeGrams,
    coffeeBeanProductId,
    manualProductCost,
  })
  const productMap = new Map(inventoryProducts.map(product => [product.id, product]))

  const update = (index, changes) => {
    onChange(components.map((component, componentIndex) =>
      componentIndex === index ? { ...component, ...changes } : component
    ))
  }

  const chooseInventoryProduct = (index, productId) => {
    const inventoryProduct = productMap.get(productId)
    const nextUnit = inventoryProduct?.stock_base_unit || components[index].unit || 'pc'
    update(index, {
      inventory_product_id: productId,
      custom_name: productId ? '' : components[index].custom_name,
      unit: nextUnit,
    })
  }

  return (
    <div className="rounded-xl border border-noch-border p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white text-sm font-semibold">Ingredients &amp; product cost</p>
          <p className="text-noch-muted text-xs mt-0.5">
            Inventory cost is automatic. Enter a manual unit cost only when inventory has no cost.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...components, createBlankCostComponent()])}
          className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 whitespace-nowrap"
        >
          <Plus size={12} /> Add ingredient
        </button>
      </div>

      {calculation.coffeeLine && (
        <div className={`rounded-lg px-3 py-2 border ${calculation.coffeeLine.complete ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-zinc-300">
              {calculation.coffeeLine.name} · {calculation.coffeeLine.quantity}g
            </span>
            <span className={calculation.coffeeLine.complete ? 'text-noch-green font-semibold' : 'text-amber-300'}>
              {calculation.coffeeLine.complete ? `${money(calculation.coffeeLine.lineCost)} LYD · automatic` : 'Missing bean cost'}
            </span>
          </div>
        </div>
      )}

      {components.length === 0 && !calculation.coffeeLine && (
        <div className="rounded-lg border border-dashed border-noch-border px-3 py-4 text-center text-noch-muted text-xs">
          No ingredients added. The manual product cost above will be used.
        </div>
      )}

      {components.map((component, index) => {
        const inventoryProduct = productMap.get(component.inventory_product_id)
        const resolved = calculation.components[index]
        const automaticCost = Number(inventoryProduct?.stock_cost_per_base_unit) > 0
        const unitOptions = inventoryProduct
          ? getCompatibleStockUnits(inventoryProduct.stock_base_unit || inventoryProduct.stock_display_unit || 'pc')
          : STOCK_UNIT_OPTIONS

        return (
          <div key={component.id || index} className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex gap-2">
              <select
                value={component.inventory_product_id || ''}
                onChange={event => chooseInventoryProduct(index, event.target.value)}
                className="input flex-1"
              >
                <option value="">Manual ingredient</option>
                {inventoryProducts.map(product => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(components.filter((_, componentIndex) => componentIndex !== index))}
                className="btn-secondary px-3 text-red-400 hover:text-red-300"
                aria-label="Remove ingredient"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {!component.inventory_product_id && (
              <input
                value={component.custom_name || ''}
                onChange={event => update(index, { custom_name: event.target.value })}
                className="input"
                placeholder="Ingredient name"
              />
            )}

            <div className="grid grid-cols-[1fr_0.8fr] gap-2">
              <div>
                <label className="label">Quantity used</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={component.quantity}
                  onChange={event => update(index, { quantity: event.target.value })}
                  className="input"
                  placeholder="1"
                />
              </div>
              <div>
                <label className="label">Unit</label>
                <select
                  value={component.unit}
                  onChange={event => update(index, { unit: event.target.value })}
                  className="input"
                >
                  {unitOptions.map(option => <option key={option.value} value={option.value}>{option.shortLabel}</option>)}
                </select>
              </div>
            </div>

            {automaticCost ? (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 text-xs">
                <span className="text-zinc-400">
                  Automatic inventory cost · {Number(inventoryProduct.stock_cost_per_base_unit).toFixed(6)} LYD/{getStockBaseUnit(component.unit)}
                </span>
                <span className="text-noch-green font-semibold">{money(resolved.lineCost)} LYD</span>
              </div>
            ) : (
              <div>
                <label className="label">
                  Manual cost per {component.unit === 'l' ? 'L' : component.unit} (LYD)
                  {component.inventory_product_id && <span className="text-amber-300 normal-case ms-1">· inventory cost missing</span>}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={component.manual_unit_cost_lyd ?? ''}
                  onChange={event => update(index, { manual_unit_cost_lyd: event.target.value })}
                  className="input"
                  placeholder="Enter manual unit cost"
                />
                {resolved.complete && <p className="text-noch-muted text-[11px] mt-1">Line cost: {money(resolved.lineCost)} LYD · manual</p>}
              </div>
            )}
          </div>
        )
      })}

      <div className={`rounded-xl px-3 py-3 border ${calculation.source === 'incomplete' ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-zinc-400 text-xs">
              {calculation.source === 'automatic' ? 'Calculated product cost' : calculation.source === 'manual' ? 'Manual product cost' : 'Cost incomplete'}
            </p>
            {calculation.source === 'incomplete' && (
              <p className="text-amber-300 text-[11px] mt-0.5">
                Add a manual cost for every ingredient without an inventory cost.
              </p>
            )}
          </div>
          <span className={`font-bold ${calculation.effectiveCost !== null ? 'text-noch-green' : 'text-amber-300'}`}>
            {calculation.effectiveCost !== null ? `${money(calculation.effectiveCost)} LYD` : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
