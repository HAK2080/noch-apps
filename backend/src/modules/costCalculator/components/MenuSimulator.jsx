import { useEffect, useState } from 'react'
import {
  getRecipesForCost, getIngredientsForCost, getCurrencyRates, calcCostPerBaseUnit
} from '../../../lib/supabase'
import { supabase } from '../../../lib/supabase'
import { TrendingUp, RotateCcw, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

function calcRecipeCost(recipe, ingredients, rates, shockPct = 0) {
  const items = recipe.recipe_ingredients || []
  return items.reduce((sum, ri) => {
    if (ri.is_fixed_cost) return sum + (parseFloat(ri.fixed_cost_lyd) || 0)
    const ing = ingredients.find(i => i.id === ri.ingredient_id)
    if (!ing) return sum
    const cpb = calcCostPerBaseUnit(
      parseFloat(ing.bulk_qty), ing.bulk_unit,
      parseFloat(ing.bulk_cost), ing.purchase_currency, rates
    )
    const adjusted = cpb * (1 + shockPct / 100)
    return sum + adjusted * parseFloat(ri.qty_used)
  }, 0)
}

export default function MenuSimulator() {
  const [recipes, setRecipes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)
  const [costShockPct, setCostShockPct] = useState(0)
  const [salesMix, setSalesMix] = useState({})
  const [targetMargin, setTargetMargin] = useState(60)
  const [editPrices, setEditPrices] = useState({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const [recs, ings, r] = await Promise.all([
        getRecipesForCost(), getIngredientsForCost(), getCurrencyRates()
      ])
      setRecipes(recs)
      setIngredients(ings)
      setRates(r)
      // Initialize edit prices from loaded recipes
      const prices = {}
      recs.forEach(rec => {
        prices[rec.id] = String(rec.selling_price_lyd ?? rec.selling_price ?? '')
      })
      setEditPrices(prices)
    } catch (err) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function saveSellPrice(recipeId, price) {
    const parsed = parseFloat(price) || 0
    const { error } = await supabase
      .from('cost_recipes')
      .update({ selling_price_lyd: parsed, updated_at: new Date().toISOString() })
      .eq('id', recipeId)
    if (error) {
      toast.error('Failed to save price')
      return
    }
    setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, selling_price_lyd: parsed } : r))
    toast.success('Price saved')
  }

  async function toggleOnMenu(recipeId, current) {
    const newVal = !current
    const { error } = await supabase
      .from('cost_recipes')
      .update({ is_on_menu: newVal, updated_at: new Date().toISOString() })
      .eq('id', recipeId)
    if (error) {
      toast.error('Failed to update')
      return
    }
    setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, is_on_menu: newVal } : r))
  }

  // Mix analysis calculations
  const menuRecipes = recipes.filter(r => r.is_on_menu)
  const mixEntries = menuRecipes.map(r => {
    const qty = parseInt(salesMix[r.id]) || 0
    const cost = calcRecipeCost(r, ingredients, rates, costShockPct)
    const price = parseFloat(r.selling_price_lyd ?? r.selling_price) || 0
    return { recipe: r, qty, cost, price }
  }).filter(e => e.qty > 0)

  const totalDailyRevenue = mixEntries.reduce((s, e) => s + e.price * e.qty, 0)
  const totalDailyCost = mixEntries.reduce((s, e) => s + e.cost * e.qty, 0)
  const totalDailyProfit = totalDailyRevenue - totalDailyCost
  const blendedMargin = totalDailyRevenue > 0 ? ((totalDailyProfit / totalDailyRevenue) * 100) : 0

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-noch-card rounded-lg w-48" />
        <div className="h-24 bg-noch-card rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-48 bg-noch-card rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-6 h-6 text-noch-green" />
          <h1 className="text-2xl font-bold text-white">Menu Simulator</h1>
        </div>
        <p className="text-noch-muted text-sm">Pricing Intelligence for Your Menu</p>
      </div>

      {/* Simulation Controls */}
      <div className="bg-noch-card border border-noch-border rounded-xl p-5">
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
          {/* Cost Shock Slider */}
          <div className="flex-1 w-full">
            <label className="text-sm text-noch-muted block mb-2">
              If ingredient costs change by <span className={`font-bold ${costShockPct > 0 ? 'text-red-400' : costShockPct < 0 ? 'text-green-400' : 'text-white'}`}>{costShockPct > 0 ? '+' : ''}{costShockPct}%</span>
            </label>
            <input
              type="range"
              min={-50}
              max={100}
              value={costShockPct}
              onChange={e => setCostShockPct(parseInt(e.target.value))}
              className="w-full accent-noch-green"
            />
            <div className="flex justify-between text-xs text-noch-muted mt-1">
              <span>-50%</span>
              <span>0%</span>
              <span>+100%</span>
            </div>
          </div>

          {/* Target Margin */}
          <div className="w-full md:w-40">
            <label className="text-sm text-noch-muted block mb-2">Target margin %</label>
            <input
              type="number"
              value={targetMargin}
              onChange={e => setTargetMargin(parseFloat(e.target.value) || 0)}
              className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green"
              min={0}
              max={99}
            />
          </div>

          {/* Reset */}
          <button
            onClick={() => setCostShockPct(0)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-noch-border text-noch-muted hover:text-white hover:bg-noch-border transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {/* Menu Items Grid */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Menu Items ({recipes.length})</h2>
        {recipes.length === 0 ? (
          <div className="bg-noch-card border border-noch-border rounded-xl p-12 text-center">
            <p className="text-noch-muted">No recipes found. Create recipes first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {recipes.map(recipe => {
              const cost = calcRecipeCost(recipe, ingredients, rates, costShockPct)
              const baseCost = calcRecipeCost(recipe, ingredients, rates, 0)
              const sellPrice = parseFloat(recipe.selling_price_lyd ?? recipe.selling_price) || 0
              const margin = sellPrice > 0 ? ((sellPrice - cost) / sellPrice) * 100 : 0
              const suggestedPrice = targetMargin < 100 ? cost / (1 - targetMargin / 100) : 0
              const isLoss = margin < 0

              return (
                <div key={recipe.id} className="bg-noch-card border border-noch-border rounded-xl p-5 space-y-4">
                  {/* Name + category + toggle */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate">{recipe.name}</h3>
                      {recipe.category && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-noch-green/10 text-noch-green">
                          {recipe.category.name || recipe.category}
                        </span>
                      )}
                    </div>
                    {/* On Menu toggle */}
                    <button
                      onClick={() => toggleOnMenu(recipe.id, recipe.is_on_menu)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        recipe.is_on_menu ? 'bg-noch-green' : 'bg-noch-border'
                      }`}
                      title={recipe.is_on_menu ? 'On Menu' : 'Off Menu'}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        recipe.is_on_menu ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* Cost */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-noch-muted">Cost (LYD)</span>
                      <span className="font-mono text-white">
                        {cost.toFixed(3)}
                        {costShockPct !== 0 && (
                          <span className="text-noch-muted text-xs ml-1">
                            (was {baseCost.toFixed(3)})
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Selling Price (editable) */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-noch-muted">Sell Price</span>
                      <input
                        type="number"
                        value={editPrices[recipe.id] ?? ''}
                        onChange={e => setEditPrices(prev => ({ ...prev, [recipe.id]: e.target.value }))}
                        onBlur={e => saveSellPrice(recipe.id, e.target.value)}
                        className="w-24 bg-noch-dark border border-noch-border rounded px-2 py-1 text-white text-sm text-right font-mono focus:outline-none focus:border-noch-green"
                        placeholder="0.00"
                        step="0.01"
                      />
                    </div>

                    {/* Margin */}
                    <div className="flex justify-between text-sm">
                      <span className="text-noch-muted">Margin</span>
                      {sellPrice > 0 ? (
                        <span className={`font-mono font-semibold ${
                          isLoss ? 'text-red-400' : margin >= 50 ? 'text-green-400' : margin >= 30 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {isLoss && (
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> LOSS
                            </span>
                          )}
                          {!isLoss && `${margin.toFixed(1)}%`}
                        </span>
                      ) : (
                        <span className="text-noch-muted text-xs">Set price</span>
                      )}
                    </div>

                    {/* Suggested price */}
                    <div className="flex justify-between text-sm">
                      <span className="text-noch-muted">Suggested @ {targetMargin}%</span>
                      <span className="font-mono text-noch-green">{suggestedPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Mix Analysis Card */}
      <div className="bg-noch-card border border-noch-border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white">Sales Mix Analysis</h2>
        <p className="text-noch-muted text-sm">Enter daily sales estimates for menu items to see projected revenue.</p>

        {menuRecipes.length === 0 ? (
          <p className="text-noch-muted text-sm py-4">Toggle items "On Menu" above to start the mix analysis.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {menuRecipes.map(r => (
                <div key={r.id} className="flex items-center gap-3 bg-noch-dark rounded-lg px-3 py-2">
                  <span className="text-sm text-white truncate flex-1">{r.name}</span>
                  <input
                    type="number"
                    min={0}
                    value={salesMix[r.id] || ''}
                    onChange={e => setSalesMix(prev => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="Qty"
                    className="w-16 bg-noch-card border border-noch-border rounded px-2 py-1 text-white text-sm text-right font-mono focus:outline-none focus:border-noch-green"
                  />
                </div>
              ))}
            </div>

            {mixEntries.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-noch-border">
                <div>
                  <p className="text-noch-muted text-xs mb-1">Daily Revenue</p>
                  <p className="text-white font-mono font-semibold">{totalDailyRevenue.toFixed(2)} LYD</p>
                </div>
                <div>
                  <p className="text-noch-muted text-xs mb-1">Daily Cost</p>
                  <p className="text-white font-mono font-semibold">{totalDailyCost.toFixed(2)} LYD</p>
                </div>
                <div>
                  <p className="text-noch-muted text-xs mb-1">Daily Profit</p>
                  <p className={`font-mono font-semibold ${totalDailyProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalDailyProfit.toFixed(2)} LYD
                  </p>
                </div>
                <div>
                  <p className="text-noch-muted text-xs mb-1">Blended Margin</p>
                  <p className={`font-mono font-semibold ${
                    blendedMargin >= 50 ? 'text-green-400' : blendedMargin >= 30 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {blendedMargin.toFixed(1)}%
                  </p>
                </div>
              </div>
            )}

            {mixEntries.length > 0 && (
              <div className="bg-noch-dark rounded-lg px-4 py-3">
                <p className="text-sm text-noch-muted">
                  If you sell this mix daily, estimated monthly profit ={' '}
                  <span className={`font-mono font-bold ${totalDailyProfit >= 0 ? 'text-noch-green' : 'text-red-400'}`}>
                    {(totalDailyProfit * 30).toFixed(2)} LYD
                  </span>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
