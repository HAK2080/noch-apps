// CategoryTab.jsx — Revenue by category

import { useState, useEffect } from 'react'
import { Tag } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import SVGBarChart from './components/SVGBarChart'

export default function CategoryTab() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: items } = await supabase
        .from('pos_order_items')
        .select('category, quantity, total_price, pos_orders!inner(created_at, status)')
        .eq('pos_orders.status', 'completed')
        .gte('pos_orders.created_at', since)

      const map = {}
      for (const item of items || []) {
        const cat = item.category || item.pos_products?.pos_categories?.name || 'Uncategorized'
        if (!map[cat]) map[cat] = { revenue: 0, units: 0 }
        map[cat].revenue += parseFloat(item.total_price) || 0
        map[cat].units += parseFloat(item.quantity) || 0
      }

      const arr = Object.entries(map).map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
      setData(arr)
    } catch {
      // Fallback: try pos_order_items differently
      setData([])
    } finally {
      setLoading(false)
    }
  }

  const total = data.reduce((s, d) => s + d.revenue, 0)

  if (loading) return <div className="py-16 text-center text-noch-muted">Loading...</div>

  if (data.length === 0) return (
    <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
      <Tag size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
      <p className="text-noch-muted text-sm">No order items found for the last 30 days.</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <h3 className="text-white font-semibold text-sm">Revenue by Category — Last 30 Days</h3>

      {/* Bar chart */}
      <div className="bg-noch-card border border-noch-border rounded-xl p-5">
        <SVGBarChart data={data.slice(0, 10)} valueKey="revenue" labelKey="label" height={160} />
        <div className="flex gap-3 flex-wrap mt-3">
          {data.slice(0, 8).map((d, i) => (
            <div key={d.label} className="flex items-center gap-1.5 text-xs text-noch-muted">
              <div className="w-2 h-2 rounded-sm bg-noch-green" style={{ opacity: 0.3 + (8 - i) / 10 }} />
              {d.label}
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-noch-muted text-xs border-b border-noch-border">
              <th className="text-left py-3 px-3">Category</th>
              <th className="text-right py-3 px-3">Revenue</th>
              <th className="text-right py-3 px-3">% of Total</th>
              <th className="text-right py-3 px-3">Units Sold</th>
              <th className="text-right py-3 px-3">Avg Price</th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => {
              const pct = total > 0 ? (d.revenue / total * 100) : 0
              const avg = d.units > 0 ? d.revenue / d.units : 0
              return (
                <tr key={d.label} className="border-b border-noch-border/50 hover:bg-noch-card/50">
                  <td className="py-3 px-3 text-white font-medium">{d.label}</td>
                  <td className="py-3 px-3 text-right text-noch-green font-bold">
                    {d.revenue.toLocaleString('en', { maximumFractionDigits: 0 })} LYD
                  </td>
                  <td className="py-3 px-3 text-right text-noch-muted">{pct.toFixed(1)}%</td>
                  <td className="py-3 px-3 text-right text-noch-muted">{Math.round(d.units)}</td>
                  <td className="py-3 px-3 text-right text-noch-muted">{avg.toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
