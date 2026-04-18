import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getRecipesForCost, getIngredientsForCost, getCurrencyRates, calcCostPerBaseUnit, deleteRecipeForCost
} from '../../../lib/supabase'
import {
  BookOpen, Plus, Search, Edit3, Trash2, TrendingUp, Filter
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function Recipes() {
  const navigate = useNavigate()
  const [recipes, setRecipes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

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
    } catch (err) {
      toast.error('Failed to load recipes')
    } finally {
      setLoading(false)
    }
  }

  function calcTotal(recipe) {
    if (!recipe.recipe_ingredients) return 0
    return recipe.recipe_ingredients.reduce((sum, ri) => {
      if (ri.is_fixed_cost) return sum + (parseFloat(ri.fixed_cost_lyd) || 0)
      if (!ri.ingredient) return sum
      const ing = ri.ingredient
      const costPerBase = calcCostPerBaseUnit(
        parseFloat(ing.bulk_qty), ing.bulk_unit,
        parseFloat(ing.bulk_cost), ing.purchase_currency, rates
      )
      return sum + costPerBase * parseFloat(ri.qty_used)
    }, 0)
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await deleteRecipeForCost(id)
      toast.success('Deleted')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const categories = [...new Set(recipes.filter((r) => r.category).map((r) => r.category.name))]

  const filtered = recipes.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = !categoryFilter || (r.category && r.category.name === categoryFilter)
    return matchSearch && matchCat
  })

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 bg-dark-700 rounded-lg w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="glass-card h-48" />)}
      </div>
    </div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Recipes</h1>
          <p className="text-gray-500 text-sm mt-1">{recipes.length} recipes</p>
        </div>
        <Link to="/recipes/new" className="neon-btn flex items-center gap-2 w-fit">
          <Plus className="w-4 h-4" /> New Recipe
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="neon-input pl-11"
            placeholder="Search recipes..."
          />
        </div>
        {categories.length > 0 && (
          <div className="relative">
            <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="neon-select pl-11"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Recipe Cards */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <p className="text-gray-500">
            {search || categoryFilter ? 'No recipes match your filters' : 'No recipes yet. Create your first one!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((recipe) => {
            const totalCost = calcTotal(recipe)
            const sp = parseFloat(recipe.selling_price) || 0
            const margin = sp > 0 ? ((sp - totalCost) / sp) * 100 : 0
            const ingredientCount = recipe.recipe_ingredients?.length || 0

            return (
              <div
                key={recipe.id}
                className="glass-card-hover p-5 flex flex-col cursor-pointer group"
                onClick={() => navigate(`/recipes/${recipe.id}/edit`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-200 truncate group-hover:text-neon-cyan transition-colors">
                      {recipe.name}
                    </h3>
                    {recipe.category && (
                      <span className="badge-purple text-[10px] mt-1">{recipe.category.name}</span>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/recipes/${recipe.id}/edit`) }}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-neon-cyan"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(recipe.id, recipe.name) }}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-neon-red"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-xs text-gray-500 mb-4">
                  {ingredientCount} ingredient{ingredientCount !== 1 ? 's' : ''}
                </div>

                <div className="mt-auto pt-3 border-t border-white/5 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Cost</span>
                    <span className="font-mono text-neon-cyan">{totalCost.toFixed(3)} LYD</span>
                  </div>
                  {sp > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Price</span>
                        <span className="font-mono text-gray-300">{sp.toFixed(2)} LYD</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Margin</span>
                        <span className={`font-mono font-semibold ${
                          margin >= 60 ? 'text-neon-green' : margin >= 40 ? 'text-neon-amber' : 'text-neon-red'
                        }`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
