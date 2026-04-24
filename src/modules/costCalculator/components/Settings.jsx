import { useEffect, useState } from 'react'
import {
  getCurrencyRates, updateCurrencyRate, getCategories, createCategory, deleteCategory,
  getRecipes, getIngredients, calcCostPerBaseUnit
} from '../../../lib/supabase'
import {
  Settings as SettingsIcon, DollarSign, Tag, Download, Save, Trash2, Plus, X,
  FileSpreadsheet, FileText
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function Settings() {
  const [rates, setRates] = useState({})
  const [rateInputs, setRateInputs] = useState({})
  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const [r, cats] = await Promise.all([getCurrencyRates(), getCategories()])
      setRates(r)
      setRateInputs({ ...r })
      setCategories(cats)
    } catch (err) {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function saveRate(currency) {
    const newRate = parseFloat(rateInputs[currency])
    if (!newRate || newRate <= 0) return toast.error('Rate must be positive')
    try {
      await updateCurrencyRate(currency, newRate)
      setRates({ ...rates, [currency]: newRate })
      toast.success(`${currency} rate updated`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleAddCategory(e) {
    e.preventDefault()
    if (!newCategory.trim()) return
    try {
      await createCategory(newCategory.trim(), 'Tag')
      setNewCategory('')
      toast.success('Category added')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDeleteCategory(id, name) {
    if (!confirm(`Delete category "${name}"?`)) return
    try {
      await deleteCategory(id)
      toast.success('Category deleted')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function exportCSV() {
    try {
      const [recipes, ingredients, ratesData] = await Promise.all([
        getRecipes(), getIngredients(), getCurrencyRates()
      ])

      const rows = [['Recipe', 'Category', 'Ingredient', 'Qty', 'Unit', 'Cost (LYD)', 'Type',
        'Total Cost', 'Selling Price', 'Margin %']]

      recipes.forEach((recipe) => {
        const totalCost = (recipe.recipe_ingredients || []).reduce((sum, ri) => {
          if (ri.is_fixed_cost) return sum + (parseFloat(ri.fixed_cost_lyd) || 0)
          if (!ri.ingredient) return sum
          const ing = ri.ingredient
          const cpb = calcCostPerBaseUnit(
            parseFloat(ing.bulk_qty), ing.bulk_unit,
            parseFloat(ing.bulk_cost), ing.purchase_currency, ratesData
          )
          return sum + cpb * parseFloat(ri.qty_used)
        }, 0)

        const sp = parseFloat(recipe.selling_price) || 0
        const margin = sp > 0 ? ((sp - totalCost) / sp * 100).toFixed(1) : ''

        ;(recipe.recipe_ingredients || []).forEach((ri, idx) => {
          const isFirst = idx === 0
          let ingName, cost
          if (ri.is_fixed_cost) {
            ingName = ri.custom_name || 'Fixed cost'
            cost = parseFloat(ri.fixed_cost_lyd) || 0
          } else if (ri.ingredient) {
            ingName = ri.ingredient.name
            const cpb = calcCostPerBaseUnit(
              parseFloat(ri.ingredient.bulk_qty), ri.ingredient.bulk_unit,
              parseFloat(ri.ingredient.bulk_cost), ri.ingredient.purchase_currency, ratesData
            )
            cost = cpb * parseFloat(ri.qty_used)
          } else {
            ingName = 'Unknown'
            cost = 0
          }
          rows.push([
            isFirst ? recipe.name : '',
            isFirst ? (recipe.category?.name || '') : '',
            ingName,
            ri.qty_used,
            ri.unit,
            cost.toFixed(4),
            ri.is_fixed_cost ? 'Fixed' : 'Ingredient',
            isFirst ? totalCost.toFixed(3) : '',
            isFirst ? (sp || '') : '',
            isFirst ? margin : '',
          ])
        })
      })

      const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
      downloadFile(csv, 'costforge-recipes.csv', 'text/csv')
      toast.success('CSV exported')
    } catch (err) {
      toast.error('Export failed: ' + err.message)
    }
  }

  async function exportJSON() {
    try {
      const [recipes, ingredients] = await Promise.all([getRecipes(), getIngredients()])
      const data = { recipes, ingredients, rates, exportedAt: new Date().toISOString() }
      const json = JSON.stringify(data, null, 2)
      downloadFile(json, 'costforge-data.json', 'application/json')
      toast.success('JSON exported')
    } catch (err) {
      toast.error('Export failed')
    }
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 bg-dark-700 rounded-lg w-48" />
      <div className="glass-card h-64" />
    </div>
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Currency rates, categories & export</p>
      </div>

      {/* Currency Rates */}
      <div className="glass-card p-6">
        <h2 className="font-semibold text-gray-200 mb-1 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-neon-cyan" />
          Currency Conversion Rates
        </h2>
        <p className="text-xs text-gray-500 mb-4">Set how much 1 unit of each currency equals in LYD</p>

        <div className="space-y-3">
          {['USD', 'GBP', 'EUR'].map((currency) => (
            <div key={currency} className="flex items-center gap-3">
              <div className="w-16 text-sm font-mono font-semibold text-gray-300">
                1 {currency}
              </div>
              <span className="text-gray-500">=</span>
              <input
                type="number"
                step="any"
                value={rateInputs[currency] || ''}
                onChange={(e) => setRateInputs({ ...rateInputs, [currency]: e.target.value })}
                className="neon-input font-mono w-32"
              />
              <span className="text-sm text-gray-400">LYD</span>
              <button
                onClick={() => saveRate(currency)}
                disabled={parseFloat(rateInputs[currency]) === rates[currency]}
                className="neon-btn text-xs flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Save className="w-3 h-3" /> Save
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="glass-card p-6">
        <h2 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <Tag className="w-5 h-5 text-neon-purple" />
          Recipe Categories
        </h2>

        <div className="space-y-2 mb-4">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-dark-800/40 border border-white/5">
              <span className="text-sm text-gray-300">{cat.name}</span>
              <button
                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                className="p-1.5 rounded-lg hover:bg-neon-red/10 text-gray-500 hover:text-neon-red transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddCategory} className="flex gap-2">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="neon-input flex-1"
            placeholder="New category name..."
          />
          <button type="submit" className="neon-btn flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add
          </button>
        </form>
      </div>

      {/* Export */}
      <div className="glass-card p-6">
        <h2 className="font-semibold text-gray-200 mb-1 flex items-center gap-2">
          <Download className="w-5 h-5 text-neon-green" />
          Export Data
        </h2>
        <p className="text-xs text-gray-500 mb-4">Download your recipes and cost data</p>

        <div className="flex flex-wrap gap-3">
          <button onClick={exportCSV} className="neon-btn-green flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={exportJSON} className="neon-btn flex items-center gap-2">
            <FileText className="w-4 h-4" /> Export JSON
          </button>
        </div>
      </div>
    </div>
  )
}
