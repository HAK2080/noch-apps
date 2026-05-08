// MenuProfitabilityTab.jsx — 2×2 quadrant matrix.
// X = contribution margin per unit. Y = units sold.
// Quadrant lines = median CM, median units.

import { useEffect, useMemo, useState } from 'react'
import { Package, AlertTriangle, X } from 'lucide-react'
import PeriodSelector from '../components/PeriodSelector'
import { getMenuMatrix, listBranches } from '../lib/finance-supabase'
import { lyd, pct } from '../lib/thresholds'
import toast from 'react-hot-toast'

const QUADRANT = {
  star:      { label: 'Star',      hint: 'Protect — don\'t change.', color: 'text-noch-green' },
  workhorse: { label: 'Workhorse', hint: 'Re-engineer cost or raise price.', color: 'text-yellow-400' },
  puzzle:    { label: 'Puzzle',    hint: 'Promote harder — high margin, low volume.', color: 'text-blue-400' },
  dog:       { label: 'Dog',       hint: 'Kill or rework.', color: 'text-red-400' },
}

function classify(item, medCM, medUnits) {
  const high_cm    = item.contribution_margin > medCM
  const high_units = item.units_sold          > medUnits
  if (high_cm  && high_units)  return 'star'
  if (!high_cm && high_units)  return 'workhorse'
  if (high_cm  && !high_units) return 'puzzle'
  return 'dog'
}

export default function MenuProfitabilityTab() {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState(null)
  const [period, setPeriod] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => { listBranches().then(setBranches).catch(() => {}) }, [])

  useEffect(() => {
    if (!period) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getMenuMatrix({ branchId, from: period.from, to: period.to })
      .then(d => { if (!cancelled) setItems(d) })
      .catch(err => { if (!cancelled) toast.error(err.message || 'Failed to load matrix') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [branchId, period?.from, period?.to])

  const { withCost, withoutCost, medCM, medUnits, classified } = useMemo(() => {
    const all = items || []
    const withCost = all.filter(i => i.has_cost && i.units_sold > 0)
    const withoutCost = all.filter(i => !i.has_cost && i.units_sold > 0)
    const cms = withCost.map(i => Number(i.contribution_margin)).sort((a, b) => a - b)
    const us  = withCost.map(i => Number(i.units_sold)).sort((a, b) => a - b)
    const medCM = cms.length ? cms[Math.floor(cms.length / 2)] : 0
    const medUnits = us.length ? us[Math.floor(us.length / 2)] : 0
    const classified = withCost.map(i => ({ ...i, quadrant: classify(i, medCM, medUnits) }))
    return { withCost, withoutCost, medCM, medUnits, classified }
  }, [items])

  // Layout dimensions
  const W = 600, H = 360, PAD = 30
  const maxCM = Math.max(1, ...classified.map(i => Number(i.contribution_margin)))
  const minCM = Math.min(0, ...classified.map(i => Number(i.contribution_margin)))
  const maxUnits = Math.max(1, ...classified.map(i => Number(i.units_sold)))

  function x(cm) {
    const range = maxCM - minCM || 1
    return PAD + ((Number(cm) - minCM) / range) * (W - 2 * PAD)
  }
  function y(units) {
    return H - PAD - (Number(units) / maxUnits) * (H - 2 * PAD)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <select value={branchId || ''} onChange={e => setBranchId(e.target.value || null)} className="input py-1 px-2 text-xs">
          <option value="">All branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <PeriodSelector value={period} onChange={setPeriod} defaultPreset="30d" />
      </div>

      {withoutCost.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="text-yellow-400 shrink-0 mt-0.5" size={16} />
          <div className="text-yellow-200 text-sm">
            <strong>{withoutCost.length} product{withoutCost.length === 1 ? '' : 's'}</strong> sold but no per-unit cost set — they show 0 cost (overstating margin). Set cost in the <strong>Cost mapping</strong> tab.
            <ul className="text-yellow-300/90 text-xs mt-1 list-disc list-inside">
              {withoutCost.slice(0, 6).map(p => <li key={p.product_id}>{p.product_name} ({Number(p.units_sold).toFixed(0)} sold)</li>)}
              {withoutCost.length > 6 && <li>…and {withoutCost.length - 6} more</li>}
            </ul>
          </div>
        </div>
      )}

      {loading ? <p className="text-noch-muted text-center py-12">Loading matrix…</p> : (
        classified.length === 0 ? (
          <div className="bg-noch-card border border-noch-border rounded-xl p-12 text-center">
            <Package className="mx-auto text-noch-muted mb-3" size={32} />
            <p className="text-noch-muted text-sm">No costed sales in this period yet.</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <h3 className="text-white text-sm font-semibold mb-3">Menu profitability — {classified.length} costed item{classified.length === 1 ? '' : 's'}</h3>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-3xl mx-auto">
              {/* Quadrant lines */}
              <line x1={x(medCM)} y1={PAD} x2={x(medCM)} y2={H - PAD} stroke="#444" strokeDasharray="3 3" />
              <line x1={PAD} y1={y(medUnits)} x2={W - PAD} y2={y(medUnits)} stroke="#444" strokeDasharray="3 3" />

              {/* Quadrant labels */}
              <text x={W - PAD - 4} y={PAD + 12}     fill="#10b981" fontSize="10" textAnchor="end">★ Star</text>
              <text x={PAD + 4}     y={PAD + 12}     fill="#3b82f6" fontSize="10">? Puzzle</text>
              <text x={W - PAD - 4} y={H - PAD - 4}  fill="#fbbf24" fontSize="10" textAnchor="end">⚙ Workhorse</text>
              <text x={PAD + 4}     y={H - PAD - 4}  fill="#f87171" fontSize="10">✗ Dog</text>

              {/* Axes */}
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#666" />
              <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#666" />
              <text x={W / 2} y={H - 6} fill="#888" fontSize="10" textAnchor="middle">Contribution margin / unit (LYD) →</text>
              <text x={10} y={H / 2} fill="#888" fontSize="10" transform={`rotate(-90 10 ${H/2})`} textAnchor="middle">Units sold →</text>

              {/* Dots */}
              {classified.map(item => {
                const meta = QUADRANT[item.quadrant]
                const cx = x(item.contribution_margin)
                const cy = y(item.units_sold)
                return (
                  <g key={item.product_id} onClick={() => setSelected(item)} style={{ cursor: 'pointer' }}>
                    <circle cx={cx} cy={cy} r={6}
                      fill={item.quadrant === 'star' ? '#10b981' : item.quadrant === 'workhorse' ? '#fbbf24' : item.quadrant === 'puzzle' ? '#3b82f6' : '#f87171'}
                      opacity="0.85"
                    />
                    <text x={cx + 8} y={cy + 3} fill="#ddd" fontSize="9">{item.product_name?.slice(0, 18)}</text>
                  </g>
                )
              })}
            </svg>
            <p className="text-noch-muted text-[11px] mt-2">Quadrants split at the median values. Click a dot for breakdown.</p>
          </div>
        )
      )}

      {/* Top-row by quadrant */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {Object.keys(QUADRANT).map(qk => {
          const meta = QUADRANT[qk]
          const list = classified.filter(i => i.quadrant === qk).sort((a, b) => Number(b.total_contribution) - Number(a.total_contribution))
          return (
            <div key={qk} className="card">
              <h4 className={`text-sm font-semibold mb-1 ${meta.color}`}>{meta.label}</h4>
              <p className="text-noch-muted text-[11px] mb-2">{meta.hint}</p>
              {list.length === 0 ? (
                <p className="text-noch-muted text-xs italic">none</p>
              ) : (
                <ul className="text-xs space-y-1">
                  {list.slice(0, 5).map(i => (
                    <li key={i.product_id} className="flex justify-between">
                      <span className="text-white truncate">{i.product_name}</span>
                      <span className="text-noch-muted ml-2 shrink-0">{Number(i.units_sold).toFixed(0)} ·  {pct(Number(i.contribution_margin_ratio), 0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-white font-bold">{selected.product_name}</h3>
                <p className={`text-xs ${QUADRANT[selected.quadrant].color}`}>{QUADRANT[selected.quadrant].label} — {QUADRANT[selected.quadrant].hint}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-noch-muted"><X size={16}/></button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Unit price"    value={lyd(selected.unit_price)} />
              <Stat label="Unit cost"     value={lyd(selected.unit_cost)} />
              <Stat label="CM / unit"     value={lyd(selected.contribution_margin)} />
              <Stat label="CM ratio"      value={pct(Number(selected.contribution_margin_ratio), 1)} />
              <Stat label="Units sold"    value={Number(selected.units_sold).toFixed(0)} />
              <Stat label="Revenue"       value={lyd(selected.revenue)} />
              <Stat label="Total CM"      value={lyd(selected.total_contribution)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-noch-dark/50 rounded-lg px-2 py-1.5">
      <p className="text-noch-muted text-[10px] uppercase">{label}</p>
      <p className="text-white font-mono">{value}</p>
    </div>
  )
}
