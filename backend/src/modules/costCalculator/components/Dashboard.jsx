import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecipes, getIngredients, getStock, getCurrencyRates, calcCostPerBaseUnit } from '../../../lib/supabase'
import {
  FlaskConical, BookOpen, Package, AlertTriangle, TrendingUp,
  ArrowRight, DollarSign
} from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalRecipes: 0,
    totalIngredients: 0,
    lowStockCount: 0,
    avgMargin: 0,
    topRecipes: [],
    recentRecipes: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    try {
      const [recipes, ingredients, stock, rates] = await Promise.all([
        getRecipes(),
        getIngredients(),
        getStock(),
        getCurrencyRates(),
      ])

      const lowStockCount = stock.filter(
        (s) => s.min_threshold > 0 && parseFloat(s.qty_available) <= parseFloat(s.min_threshold)
      ).length

      // Calculate margins for recipes that have a selling price
      const recipesWithMargin = recipes
        .map((r) => {
          const totalCost = calcRecipeTotalCost(r, ingredients, rates)
          const sellingPrice = parseFloat(r.selling_price) || 0
          const margin = sellingPrice > 0 ? ((sellingPrice - totalCost) / sellingPrice) * 100 : 0
          return { ...r, totalCost, margin }
        })
        .filter((r) => r.selling_price > 0)

      const avgMargin =
        recipesWithMargin.length > 0
          ? recipesWithMargin.reduce((sum, r) => sum + r.margin, 0) / recipesWithMargin.length
          : 0

      const topRecipes = [...recipesWithMargin].sort((a, b) => b.margin - a.margin).slice(0, 5)

      setStats({
        totalRecipes: recipes.length,
        totalIngredients: ingredients.length,
        lowStockCount,
        avgMargin,
        topRecipes,
        recentRecipes: recipes.slice(0, 5),
      })
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  function calcRecipeTotalCost(recipe, ingredients, rates) {
    if (!recipe.recipe_ingredients) return 0
    return recipe.recipe_ingredients.reduce((sum, ri) => {
      if (ri.is_fixed_cost) return sum + (parseFloat(ri.fixed_cost_lyd) || 0)
      if (!ri.ingredient) return sum
      const ing = ri.ingredient
      const costPerBase = calcCostPerBaseUnit(
        parseFloat(ing.bulk_qty),
        ing.bulk_unit,
        parseFloat(ing.bulk_cost),
        ing.purchase_currency,
        rates
      )
      return sum + costPerBase * parseFloat(ri.qty_used)
    }, 0)
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-dark-700 rounded-lg w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card p-6 h-32" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of your cafe operations</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={BookOpen}
          label="Recipes"
          value={stats.totalRecipes}
          color="cyan"
          link="/recipes"
        />
        <StatCard
          icon={FlaskConical}
          label="Ingredients"
          value={stats.totalIngredients}
          color="purple"
          link="/ingredients"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Margin"
          value={`${stats.avgMargin.toFixed(1)}%`}
          color="green"
        />
        <StatCard
          icon={stats.lowStockCount > 0 ? AlertTriangle : Package}
          label="Low Stock"
          value={stats.lowStockCount}
          color={stats.lowStockCount > 0 ? 'red' : 'green'}
          link="/stock"
        />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Margin Recipes */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-200">Top Margin Recipes</h2>
            <DollarSign className="w-4 h-4 text-neon-green" />
          </div>
          {stats.topRecipes.length === 0 ? (
            <p className="text-gray-500 text-sm">Add recipes with selling prices to see margins</p>
          ) : (
            <div className="space-y-3">
              {stats.topRecipes.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-sm text-gray-300">{r.name}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      Cost: {r.totalCost.toFixed(2)} LYD
                    </span>
                  </div>
                  <span className={`font-mono text-sm font-semibold ${
                    r.margin >= 60 ? 'text-neon-green' : r.margin >= 40 ? 'text-neon-amber' : 'text-neon-red'
                  }`}>
                    {r.margin.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Recipes */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-200">Recent Recipes</h2>
            <Link to="/recipes/new" className="text-neon-cyan text-xs hover:underline flex items-center gap-1">
              New Recipe <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {stats.recentRecipes.length === 0 ? (
            <p className="text-gray-500 text-sm">No recipes yet. Create your first one!</p>
          ) : (
            <div className="space-y-3">
              {stats.recentRecipes.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-sm text-gray-300">{r.name}</span>
                    {r.category && (
                      <span className="badge-purple ml-2 text-[10px]">{r.category.name}</span>
                    )}
                  </div>
                  {r.selling_price && (
                    <span className="font-mono text-sm text-gray-400">
                      {parseFloat(r.selling_price).toFixed(2)} LYD
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, link }) {
  const colorMap = {
    cyan: 'text-neon-cyan border-neon-cyan/20 bg-neon-cyan/5',
    purple: 'text-neon-purple border-neon-purple/20 bg-neon-purple/5',
    green: 'text-neon-green border-neon-green/20 bg-neon-green/5',
    red: 'text-neon-red border-neon-red/20 bg-neon-red/5',
    amber: 'text-neon-amber border-neon-amber/20 bg-neon-amber/5',
  }
  const card = (
    <div className="glass-card-hover p-6 group cursor-pointer">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</p>
          <p className="stat-value text-3xl">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
  return link ? <Link to={link}>{card}</Link> : card
}
