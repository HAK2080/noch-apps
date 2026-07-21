import { COFFEE_GRAM_PRESETS, normalizeCoffeeGrams } from '../lib/coffee-consumption'

export default function CoffeeConsumptionField({
  value,
  onChange,
  beanProductId,
  onBeanProductChange,
  beanProducts = [],
}) {
  const grams = normalizeCoffeeGrams(value)

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-white text-sm font-semibold">Coffee beans used per sale</p>
          <p className="text-noch-muted text-xs mt-0.5">
            Deducted in grams from the selected roasted beans at the selling branch.
          </p>
        </div>
        {grams && <span className="text-amber-300 font-bold text-sm whitespace-nowrap">{grams} g</span>}
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {COFFEE_GRAM_PRESETS.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              grams === option.value
                ? 'border-noch-green bg-noch-green/15 text-noch-green'
                : 'border-noch-border bg-noch-dark text-noch-muted hover:text-white'
            }`}
          >
            {option.label} · {option.value} g
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange('')}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
            grams === null
              ? 'border-zinc-500 bg-zinc-500/10 text-zinc-300'
              : 'border-noch-border bg-noch-dark text-noch-muted hover:text-white'
          }`}
        >
          No beans
        </button>
      </div>

      <label className="label block mb-1">Manual grams</label>
      <div className="relative">
        <input
          type="number"
          min="0"
          step="0.1"
          value={value ?? ''}
          onChange={event => onChange(event.target.value)}
          placeholder="Enter grams per drink"
          className="input w-full pr-10"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-noch-muted text-xs">g</span>
      </div>
      {grams && beanProducts.length > 0 && (
        <div className="mt-3">
          <label className="label block mb-1">Coffee bean source</label>
          <select
            value={beanProductId || ''}
            onChange={event => onBeanProductChange?.(event.target.value || null)}
            className="input w-full"
          >
            <option value="">Ghadamis Coffee Beans (default)</option>
            {beanProducts.map(bean => (
              <option key={bean.id} value={bean.id}>
                {bean.name} · {Number(bean.stock_cost_per_base_unit || 0).toFixed(5)} LYD/g
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
