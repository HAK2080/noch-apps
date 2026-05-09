// IntelligenceTab.jsx — AI-powered business intelligence

import { useState, useEffect } from 'react'
import { Brain, Zap, TrendingDown, AlertTriangle, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

async function runIntelligence(salesData, costsData, lowStockItems) {
  const { data, error } = await supabase.functions.invoke('analytics-ai-insights', {
    body: { salesData, costsData, lowStockItems },
  })
  if (error) throw new Error(error.message || 'AI analysis failed')
  if (data?.error) throw new Error(data.error)
  return data
}

export default function IntelligenceTab() {
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [autoInsights, setAutoInsights] = useState(null)
  const [loadingInsights, setLoadingInsights] = useState(true)

  useEffect(() => { loadAutoInsights() }, [])

  async function loadAutoInsights() {
    setLoadingInsights(true)
    try {
      const { data: stock } = await supabase
        .from('stock')
        .select('qty_available, min_threshold, ingredient:ingredients(name, base_unit)')
        .lt('qty_available', 7)

      const insights = []

      // Low stock (< 7 days estimated)
      const criticalStock = (stock || []).filter(s => s.min_threshold > 0 && s.qty_available <= s.min_threshold * 1.2)
      if (criticalStock.length > 0) {
        insights.push({
          type: 'warning',
          title: `${criticalStock.length} items near stockout`,
          detail: criticalStock.slice(0, 3).map(s => s.ingredient?.name || 'Unknown').join(', ') + (criticalStock.length > 3 ? '...' : ''),
        })
      }

      setAutoInsights(insights)
    } catch (err) { void err }
    finally { setLoadingInsights(false) }
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString()
      const [{ data: orders }, { data: costs }, { data: stock }] = await Promise.all([
        supabase.from('pos_orders').select('total, created_at, status').eq('status', 'completed').gte('created_at', since),
        supabase.from('operating_costs').select('*').gte('period_start', since.slice(0, 10)),
        supabase.from('stock').select('qty_available, min_threshold, ingredient:ingredients(name, base_unit)')
          .filter('qty_available', 'lte', 10),
      ])

      // Process orders by category (simplified)
      const byDay = {}
      for (const o of orders || []) {
        const day = o.created_at?.slice(0, 10)
        if (day) byDay[day] = (byDay[day] || 0) + (parseFloat(o.total) || 0)
      }

      const salesData = {
        totalRevenue: (orders || []).reduce((s, o) => s + (parseFloat(o.total) || 0), 0),
        orderCount: (orders || []).length,
        topCategories: [],
        avgOrder: (orders || []).length > 0
          ? (orders || []).reduce((s, o) => s + (parseFloat(o.total) || 0), 0) / orders.length
          : 0,
      }

      const lowStockItems = (stock || [])
        .filter(s => s.min_threshold > 0 && s.qty_available <= s.min_threshold)
        .map(s => ({ name: s.ingredient?.name || 'Unknown', qty_available: s.qty_available, base_unit: s.ingredient?.base_unit || '', min_threshold: s.min_threshold }))

      const analysis = await runIntelligence(salesData, costs || [], lowStockItems)
      setResult(analysis)
      toast.success('Analysis complete')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  function handlePrint() {
    if (!result) return
    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Noch Business Intelligence Report</title>
<style>body{font-family:sans-serif;padding:2rem;max-width:800px;margin:auto}h1{color:#4ADE80}h2{color:#333;border-bottom:2px solid #eee;padding-bottom:0.5rem}
.card{background:#f8f8f8;border-radius:8px;padding:1rem;margin:0.5rem 0}
.impact{color:#059669;font-size:0.85rem}.priority{background:#4ADE80;color:#000;padding:2px 8px;border-radius:99px;font-size:0.75rem}</style>
</head><body>
<h1>Noch Business Intelligence Report</h1>
<p>Generated: ${new Date().toLocaleString()}</p>
<h2>Opportunities</h2>
${(result.opportunities || []).map(o => `<div class="card"><strong>${o.title}</strong><p>${o.detail}</p><div class="impact">Impact: ${o.estimated_impact}</div></div>`).join('')}
<h2>Cost Reduction</h2>
${(result.cost_cuts || []).map(c => `<div class="card"><strong>${c.title}</strong><p>${c.detail}</p><div class="impact">Saving: ${c.estimated_saving}</div></div>`).join('')}
<h2>Anomalies</h2>
${(result.anomalies || []).map(a => `<div class="card"><strong>${a.title}</strong><p>${a.detail}</p></div>`).join('')}
<h2>Priority Actions</h2>
${(result.actions || []).map(a => `<div class="card"><span class="priority">#${a.priority}</span> <strong>${a.action}</strong><p>${a.expected_impact}</p></div>`).join('')}
</body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    w.print()
  }

  return (
    <div className="space-y-6">
      {/* Auto-insights */}
      {!loadingInsights && autoInsights?.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Zap size={16} className="text-yellow-400" /> Auto-Insights
          </h3>
          {autoInsights.map((ins, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${ins.type === 'warning' ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-noch-card border-noch-border'}`}>
              <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white text-sm font-medium">{ins.title}</p>
                <p className="text-noch-muted text-xs">{ins.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Analysis button */}
      <div className="text-center">
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="px-8 py-3 bg-noch-green text-noch-dark font-semibold rounded-xl hover:bg-noch-green/90 disabled:opacity-50 flex items-center gap-3 mx-auto"
        >
          {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Brain size={18} />}
          {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
        </button>
        <p className="text-noch-muted text-xs mt-2">Analyzes last 30 days of sales, costs, and inventory</p>
      </div>

      {/* Results */}
      {result && (
        <>
          <div className="flex justify-end">
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-2 text-sm">
              <Printer size={14} /> Generate Report
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Opportunities */}
            <div className="bg-noch-card border border-noch-border rounded-xl p-5">
              <h3 className="text-noch-green font-semibold mb-3 flex items-center gap-2">
                <TrendingDown size={16} /> Opportunities ({(result.opportunities || []).length})
              </h3>
              <div className="space-y-3">
                {(result.opportunities || []).map((o, i) => (
                  <div key={i} className="border-b border-noch-border/50 pb-3 last:border-0 last:pb-0">
                    <p className="text-white text-sm font-medium">{o.title}</p>
                    <p className="text-noch-muted text-xs mt-1">{o.detail}</p>
                    {o.estimated_impact && <p className="text-noch-green text-xs mt-1 font-medium">{o.estimated_impact}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Cost Cuts */}
            <div className="bg-noch-card border border-noch-border rounded-xl p-5">
              <h3 className="text-yellow-400 font-semibold mb-3">Cost Reduction</h3>
              <div className="space-y-3">
                {(result.cost_cuts || []).map((c, i) => (
                  <div key={i} className="border-b border-noch-border/50 pb-3 last:border-0 last:pb-0">
                    <p className="text-white text-sm font-medium">{c.title}</p>
                    <p className="text-noch-muted text-xs mt-1">{c.detail}</p>
                    {c.estimated_saving && <p className="text-yellow-400 text-xs mt-1 font-medium">{c.estimated_saving}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Anomalies */}
            {(result.anomalies || []).length > 0 && (
              <div className="bg-noch-card border border-red-500/20 rounded-xl p-5">
                <h3 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} /> Anomalies
                </h3>
                <div className="space-y-3">
                  {result.anomalies.map((a, i) => (
                    <div key={i} className="border-b border-noch-border/50 pb-3 last:border-0 last:pb-0">
                      <p className="text-white text-sm font-medium">{a.title}</p>
                      <p className="text-noch-muted text-xs mt-1">{a.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Priority Actions */}
            <div className="bg-noch-card border border-noch-border rounded-xl p-5">
              <h3 className="text-white font-semibold mb-3">Priority Actions</h3>
              <div className="space-y-2">
                {(result.actions || []).sort((a, b) => a.priority - b.priority).map((a, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-noch-dark rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-noch-green/20 text-noch-green text-xs font-bold flex items-center justify-center shrink-0">
                      {a.priority}
                    </span>
                    <div>
                      <p className="text-white text-sm">{a.action}</p>
                      <p className="text-noch-muted text-xs">{a.expected_impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
