import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getIngredients, getCategories, getCurrencyRates, calcCostPerBaseUnit,
  createRecipe, updateRecipe, getRecipe
} from '../../../lib/supabase'
import {
  Plus, Trash2, Save, ArrowLeft, X, GripVertical, Calculator, TrendingUp, ShoppingBag
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getPOSBranches, getPOSProducts, createPOSProduct, updatePOSProduct } from '../../pos/lib/pos-supabase'

export default function RecipeBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [ingredients, setIngredients] = useState([])
  const [categories, setCategories] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [showSaveAsProduct, setShowSaveAsProduct] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [ings, cats, r] = await Promise.all([
        getIngredients(), getCategories(), getCurrencyRates()
      ])
      setIngredients(ings)
      setCategories(cats)
      setRates(r)

      if (id) {
        const recipe = await getRecipe(id)
        setName(recipe.name)
        setCategoryId(recipe.category_id || '')
        setSellingPrice(recipe.selling_price || '')
        setNotes(recipe.notes || '')
        setItems(
          recipe.recipe_ingredients.map((ri) => ({
            key: crypto.randomUUID(),
            type: ri.is_fixed_cost ? 'fixed' : 'ingredient',
            ingredient_id: ri.ingredient_id || '',
            custom_name: ri.custom_name || '',
            qty_used: ri.qty_used,
            unit: ri.unit,
            fixed_cost_lyd: ri.fixed_cost_lyd || '',
          }))
        )
      }
    } catch (err) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  function addIngredientItem() {
    setItems([...items, {
      key: crypto.randomUUID(),
      type: 'ingredient',
      ingredient_id: '',
      custom_name: '',
      qty_used: '',
      unit: 'g',
      fixed_cost_lyd: '',
    }])
  }

  function addFixedCostItem() {
    setItems([...items, {
      key: crypto.randomUUID(),
      type: 'fixed',
      ingredient_id: '',
      custom_name: '',
      qty_used: 1,
      unit: 'piece',
      fixed_cost_lyd: '',
    }])
  }

  function updateItem(key, field, value) {
    setItems(items.map((item) => {
      if (item.key !== key) return item
      const updated = { ...item, [field]: value }
      // Auto-set unit when ingredient is selected
      if (field === 'ingredient_id' && value) {
        const ing = ingredients.find((i) => i.id === value)
        if (ing) updated.unit = ing.base_unit
      }
      return updated
    }))
  }

  function removeItem(key) {
    setItems(items.filter((item) => item.key !== key))
  }

  function getItemCost(item) {
    if (item.type === 'fixed') {
      return parseFloat(item.fixed_cost_lyd) || 0
    }
    if (!item.ingredient_id || !item.qty_used) return 0
    const ing = ingredients.find((i) => i.id === item.ingredient_id)
    if (!ing) return 0
    const costPerBase = calcCostPerBaseUnit(
      parseFloat(ing.bulk_qty), ing.bulk_unit,
      parseFloat(ing.bulk_cost), ing.purchase_currency, rates
    )
    return costPerBase * parseFloat(item.qty_used)
  }

  const totalCost = items.reduce((sum, item) => sum + getItemCost(item), 0)
  const sp = parseFloat(sellingPrice) || 0
  const profit = sp - totalCost
  const margin = sp > 0 ? (profit / sp) * 100 : 0
  const markup = totalCost > 0 ? (profit / totalCost) * 100 : 0

  async function handleSave() {
    if (!name.trim()) return toast.error('Recipe name is required')
    if (items.length === 0) return toast.error('Add at least one ingredient')

    setSaving(true)
    try {
      const recipe = {
        name: name.trim(),
        category_id: categoryId || null,
        selling_price: sp || null,
        notes: notes.trim() || null,
      }
      const recipeItems = items.map((item) => ({
        ingredient_id: item.type === 'ingredient' ? item.ingredient_id : null,
        custom_name: item.type === 'fixed' ? item.custom_name : null,
        qty_used: parseFloat(item.qty_used) || 0,
        unit: item.unit,
        is_fixed_cost: item.type === 'fixed',
        fixed_cost_lyd: item.type === 'fixed' ? parseFloat(item.fixed_cost_lyd) || 0 : 0,
      }))

      if (isEditing) {
        await updateRecipe(id, recipe, recipeItems)
        toast.success('Recipe updated!')
      } else {
        await createRecipe(recipe, recipeItems)
        toast.success('Recipe saved!')
      }
      navigate('/recipes')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleDrop() {
    if (items.length > 0 && !confirm('Discard this recipe?')) return
    navigate('/recipes')
  }

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 bg-dark-700 rounded-lg w-48" />
      <div className="glass-card h-96" />
    </div>
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/recipes')} className="text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            {isEditing ? 'Edit Recipe' : 'New Recipe'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Build your recipe and calculate costs</p>
        </div>
      </div>

      {/* Recipe Info */}
      <div className="glass-card p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Recipe Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="neon-input"
              placeholder="e.g., Matcha Latte"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="neon-select"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="neon-input"
            placeholder="e.g., Best seller, use ceremonial grade matcha"
          />
        </div>
      </div>

      {/* Ingredients List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-200">Ingredients & Costs</h2>
          <div className="flex gap-2">
            <button onClick={addIngredientItem} className="neon-btn text-xs flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Ingredient
            </button>
            <button onClick={addFixedCostItem} className="neon-btn text-xs flex items-center gap-1.5" style={{
              borderColor: 'rgba(168, 85, 247, 0.3)', color: '#a855f7',
              background: 'rgba(168, 85, 247, 0.1)'
            }}>
              <Plus className="w-3.5 h-3.5" /> Fixed Cost
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calculator className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Add ingredients or fixed costs to start calculating</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.key}
                className="bg-dark-800/60 rounded-xl p-4 border border-white/5 animate-slide-up"
              >
                {item.type === 'ingredient' ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Ingredient</label>
                      <select
                        value={item.ingredient_id}
                        onChange={(e) => updateItem(item.key, 'ingredient_id', e.target.value)}
                        className="neon-select text-sm"
                      >
                        <option value="">Select ingredient...</option>
                        {ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>{ing.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-28">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Qty Used</label>
                      <input
                        type="number"
                        step="any"
                        value={item.qty_used}
                        onChange={(e) => updateItem(item.key, 'qty_used', e.target.value)}
                        className="neon-input font-mono text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Unit</label>
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(item.key, 'unit', e.target.value)}
                        className="neon-select text-sm"
                      >
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="piece">piece</option>
                      </select>
                    </div>
                    <div className="w-28 flex flex-col">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Cost</label>
                      <div className="neon-input bg-dark-900/50 font-mono text-neon-green text-sm flex items-center">
                        {getItemCost(item).toFixed(3)} <span className="text-gray-500 ml-1 text-xs">LYD</span>
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => removeItem(item.key)}
                        className="p-3 rounded-xl hover:bg-neon-red/10 text-gray-400 hover:text-neon-red transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">
                        Item Name
                        <span className="badge-purple ml-2 text-[8px]">FIXED COST</span>
                      </label>
                      <input
                        type="text"
                        value={item.custom_name}
                        onChange={(e) => updateItem(item.key, 'custom_name', e.target.value)}
                        className="neon-input text-sm"
                        placeholder="e.g., Cup, Label, Ops cost"
                      />
                    </div>
                    <div className="w-28">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Cost (LYD)</label>
                      <input
                        type="number"
                        step="any"
                        value={item.fixed_cost_lyd}
                        onChange={(e) => updateItem(item.key, 'fixed_cost_lyd', e.target.value)}
                        className="neon-input font-mono text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="w-28 flex flex-col">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Cost</label>
                      <div className="neon-input bg-dark-900/50 font-mono text-neon-green text-sm flex items-center">
                        {getItemCost(item).toFixed(3)} <span className="text-gray-500 ml-1 text-xs">LYD</span>
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => removeItem(item.key)}
                        className="p-3 rounded-xl hover:bg-neon-red/10 text-gray-400 hover:text-neon-red transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cost Summary & Pricing */}
      <div className="glass-card p-6 border-neon-cyan/20">
        <h2 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-neon-cyan" />
          Cost Summary & Pricing
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-gray-400 text-sm">Total Cost</span>
              <span className="font-mono text-lg font-bold text-neon-cyan">{totalCost.toFixed(3)} LYD</span>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Selling Price (LYD)</label>
              <input
                type="number"
                step="any"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="neon-input font-mono"
                placeholder="e.g., 15.00"
              />
            </div>
          </div>
          {sp > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-gray-400 text-sm">Profit per unit</span>
                <span className={`font-mono text-lg font-bold ${profit >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                  {profit.toFixed(3)} LYD
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-gray-400 text-sm">Margin</span>
                <span className={`font-mono font-bold ${margin >= 60 ? 'text-neon-green' : margin >= 40 ? 'text-neon-amber' : 'text-neon-red'}`}>
                  {margin.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-400 text-sm">Markup</span>
                <span className="font-mono font-bold text-neon-purple">{markup.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Scaling calculator */}
        <ScalingCalc totalCost={totalCost} sellingPrice={sp} />
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="neon-btn-green flex items-center gap-2 px-8 py-3"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : isEditing ? 'Update Recipe' : 'Save Recipe'}
        </button>
        {isEditing && totalCost > 0 && (
          <button
            onClick={() => setShowSaveAsProduct(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'rgba(74,222,128,0.1)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.25)' }}
          >
            <ShoppingBag className="w-4 h-4" />
            Save as Product
          </button>
        )}
        <button
          onClick={handleDrop}
          className="neon-btn-danger flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          {isEditing ? 'Cancel' : 'Drop'}
        </button>
      </div>

      {showSaveAsProduct && (
        <SaveAsProductModal
          recipeName={name}
          recipeId={id}
          calculatedCost={totalCost}
          onClose={() => setShowSaveAsProduct(false)}
        />
      )}
    </div>
  )
}

function SaveAsProductModal({ recipeName, recipeId, calculatedCost, onClose }) {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getPOSBranches().then(b => { setBranches(b); if (b.length > 0) setBranchId(b[0].id) }).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!branchId) return toast.error('Select a branch')
    if (!salePrice || parseFloat(salePrice) <= 0) return toast.error('Enter a sale price')
    setSaving(true)
    try {
      // Check if a product with this recipe already exists in this branch
      const existing = await getPOSProducts(branchId)
      const match = existing.find(p => p.cost_recipe_id === recipeId)
      const payload = {
        name: recipeName,
        price: parseFloat(salePrice),
        cost_price: parseFloat(calculatedCost.toFixed(3)),
        cost_recipe_id: recipeId,
        branch_id: branchId,
        is_active: true,
      }
      if (match) {
        await updatePOSProduct(match.id, { price: payload.price, cost_price: payload.cost_price, cost_recipe_id: recipeId })
        toast.success(`Updated "${recipeName}" in Products`)
      } else {
        await createPOSProduct(payload)
        toast.success(`"${recipeName}" saved as product`)
      }
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const margin = salePrice && parseFloat(salePrice) > 0
    ? ((parseFloat(salePrice) - calculatedCost) / parseFloat(salePrice) * 100).toFixed(1)
    : null

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: '#131318', border: '1px solid #1E2030' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold flex items-center gap-2"><ShoppingBag size={16} className="text-noch-green" /> Save as Product</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-sm py-2 border-b" style={{ borderColor: '#1E2030' }}>
            <span className="text-zinc-400">Recipe</span>
            <span className="text-white font-medium">{recipeName}</span>
          </div>
          <div className="flex justify-between text-sm py-2 border-b" style={{ borderColor: '#1E2030' }}>
            <span className="text-zinc-400">Calculated Cost</span>
            <span className="text-noch-green font-bold">{calculatedCost.toFixed(3)} LYD</span>
          </div>

          {branches.length > 1 && (
            <div>
              <label className="label">Branch</label>
              <select value={branchId} onChange={e => setBranchId(e.target.value)} className="input">
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">Sale Price (LYD) *</label>
            <input type="number" value={salePrice} onChange={e => setSalePrice(e.target.value)} className="input" placeholder="8.500" step="0.001" min="0" autoFocus />
            {margin !== null && (
              <p className={`text-xs mt-1 font-semibold ${parseFloat(margin) >= 50 ? 'text-emerald-400' : parseFloat(margin) >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                {margin}% gross margin · profit {(parseFloat(salePrice) - calculatedCost).toFixed(3)} LYD
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 text-sm">
            {saving ? 'Saving…' : 'Save to Products'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScalingCalc({ totalCost, sellingPrice }) {
  const [qty, setQty] = useState('')
  const q = parseInt(qty) || 0

  if (q <= 0) {
    return (
      <div className="mt-6 pt-4 border-t border-white/5">
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
          Batch Scaling — How many units?
        </label>
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="neon-input font-mono max-w-xs"
          placeholder="e.g., 50"
        />
      </div>
    )
  }

  return (
    <div className="mt-6 pt-4 border-t border-white/5">
      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
        Batch Scaling — How many units?
      </label>
      <input
        type="number"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="neon-input font-mono max-w-xs mb-4"
        placeholder="e.g., 50"
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-dark-800 rounded-xl p-3 border border-white/5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Cost</p>
          <p className="font-mono text-neon-cyan font-bold">{(totalCost * q).toFixed(2)} LYD</p>
        </div>
        {sellingPrice > 0 && (
          <>
            <div className="bg-dark-800 rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Revenue</p>
              <p className="font-mono text-gray-200 font-bold">{(sellingPrice * q).toFixed(2)} LYD</p>
            </div>
            <div className="bg-dark-800 rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Profit</p>
              <p className="font-mono text-neon-green font-bold">{((sellingPrice - totalCost) * q).toFixed(2)} LYD</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
