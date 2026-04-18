// BranchTab.jsx — Per-branch comparison

import { useState, useEffect } from 'react'
import { Building2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function BranchTab() {
  const [branches, setBranches] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: branchData } = await supabase
        .from('pos_branches').select('id, name').eq('is_active', true)
      setBranches(branchData || [])

      // Last 30 days
      const since = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: orders } = await supabase
        .from('pos_orders')
        .select('branch_id, total')
        .eq('status', 'completed')
        .gte('created_at', since)

      const map = {}
      for (const o of orders || []) {
        if (!map[o.branch_id]) map[o.branch_id] = { revenue: 0, count: 0 }
        map[o.branch_id].revenue += parseFloat(o.total) || 0
        map[o.branch_id].count += 1
      }
      setStats(map)
    } catch {}
    finally { setLoading(false) }
  }

  const sortedBranches = [...branches].sort((a, b) =>
    (stats[b.id]?.revenue || 0) - (stats[a.id]?.revenue || 0)
  )

  if (loading) return <div className="py-16 text-center text-noch-muted">Loading...</div>

  if (branches.length === 0) return (
    <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
      <Building2 size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
      <p className="text-noch-muted text-sm">No branches found. Create branches in POS Settings.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold text-sm">Branch Performance — Last 30 Days</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-noch-muted text-xs border-b border-noch-border">
              <th className="text-left py-3 px-3">#</th>
              <th className="text-left py-3 px-3">Branch</th>
              <th className="text-right py-3 px-3">Revenue (LYD)</th>
              <th className="text-right py-3 px-3">Orders</th>
              <th className="text-right py-3 px-3">Avg Order</th>
            </tr>
          </thead>
          <tbody>
            {sortedBranches.map((b, i) => {
              const s = stats[b.id] || { revenue: 0, count: 0 }
              const avg = s.count > 0 ? s.revenue / s.count : 0
              return (
                <tr key={b.id} className="border-b border-noch-border/50 hover:bg-noch-card/50">
                  <td className="py-3 px-3">
                    <span className="text-noch-muted font-mono">#{i + 1}</span>
                  </td>
                  <td className="py-3 px-3 text-white font-medium">{b.name}</td>
                  <td className="py-3 px-3 text-right text-noch-green font-bold">
                    {s.revenue.toLocaleString('en', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-3 text-right text-noch-muted">{s.count}</td>
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
