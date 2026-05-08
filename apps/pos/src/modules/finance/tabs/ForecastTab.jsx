// ForecastTab — three-slider scenario projector.

import { useEffect, useState } from 'react'
import { TrendingUp, Save } from 'lucide-react'
import { runForecast, listScenarios, saveScenario, listBranches } from '../lib/finance-supabase'
import { lyd } from '../lib/thresholds'
import toast from 'react-hot-toast'

function nDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const TODAY = new Date().toISOString().slice(0, 10)

export default function ForecastTab() {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState(null)
  const [from, setFrom] = useState(nDaysAgo(30))
  const [to, setTo] = useState(TODAY)
  const [horizon, setHorizon] = useState(90)
  const [matchaCost, setMatchaCost] = useState(0)
  const [salesVol, setSalesVol] = useState(0)
  const [labor, setLabor] = useState(0)
  const [result, setResult] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(false)
  const [saveName, setSaveName] = useState('')

  useEffect(() => { listBranches().then(setBranches).catch(() => {}); listScenarios().then(setScenarios).catch(() => {}) }, [])

  const run = async () => {
    setLoading(true)
    try {
      const r = await runForecast({
        branchId, baselineFrom: from, baselineTo: to, horizonDays: horizon,
        matchaCostDelta: matchaCost, salesVolumeDelta: salesVol, laborHeadcountDelta: labor,
      })
      setResult(r)
    } catch (err) { toast.error(err.message || 'Forecast failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { run() /* eslint-disable-next-line */ }, [branchId, from, to, horizon, matchaCost, salesVol, labor])

  const save = async () => {
    if (!saveName) return toast.error('Name the scenario')
    try {
      await saveScenario({
        name: saveName, branch_id: branchId,
        matcha_cost_pct_delta: matchaCost, sales_volume_pct_delta: salesVol,
        labor_headcount_delta: labor, baseline_period_from: from, baseline_period_to: to,
      })
      toast.success('Saved')
      setSaveName('')
      setScenarios(await listScenarios())
    } catch (err) { toast.error(err.message || 'Save failed') }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-noch-green"/>
          <h3 className="text-white text-sm font-semibold">Scenario forecast</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="label block mb-1 text-xs">Branch</label>
            <select value={branchId || ''} onChange={e => setBranchId(e.target.value || null)} className="input w-full text-sm py-1">
              <option value="">All</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><label className="label block mb-1 text-xs">Baseline from</label>
            <input type="date" className="input w-full text-sm py-1" value={from} max={to} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="label block mb-1 text-xs">Baseline to</label>
            <input type="date" className="input w-full text-sm py-1" value={to} min={from} onChange={e => setTo(e.target.value)} /></div>
          <div><label className="label block mb-1 text-xs">Horizon (days)</label>
            <input type="number" className="input w-full text-sm py-1" value={horizon} min="7" max="365" onChange={e => setHorizon(Number(e.target.value))} /></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
          <Slider label="Matcha cost Δ%" value={matchaCost} onChange={setMatchaCost} min={-50} max={100} />
          <Slider label="Sales volume Δ%" value={salesVol} onChange={setSalesVol} min={-50} max={100} />
          <Slider label="Labor headcount Δ" value={labor} onChange={setLabor} min={-3} max={5} step={1} />
        </div>

        {loading ? <p className="text-noch-muted text-center py-6">Calculating…</p> : result && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <Stat label="Revenue" value={lyd(result.projected_revenue)} />
            <Stat label="COGS" value={lyd(result.projected_cogs)} />
            <Stat label="Labor" value={lyd(result.projected_labor)} />
            <Stat label="OpEx" value={lyd(result.projected_opex)} />
            <Stat label="Net" value={lyd(result.projected_net)}
              color={Number(result.projected_net) >= 0 ? 'text-noch-green' : 'text-red-400'} />
          </div>
        )}

        <div className="flex gap-2 mt-4 items-center">
          <input className="input flex-1 py-1 text-sm" placeholder="Save scenario as…" value={saveName} onChange={e => setSaveName(e.target.value)} />
          <button onClick={save} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"><Save size={11}/> Save</button>
        </div>
      </div>

      {scenarios.length > 0 && (
        <div className="card">
          <h4 className="text-white text-sm font-semibold mb-2">Saved scenarios</h4>
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Name</th>
                <th className="text-right py-1 pr-2">Matcha Δ</th>
                <th className="text-right py-1 pr-2">Sales Δ</th>
                <th className="text-right py-1 pr-2">Headcount Δ</th>
                <th className="text-left py-1 pr-2">Saved</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map(s => (
                <tr key={s.id} className="border-t border-noch-border/40">
                  <td className="py-1.5 pr-2 text-white">{s.name}</td>
                  <td className="py-1.5 pr-2 text-right">{Number(s.matcha_cost_pct_delta || 0)}%</td>
                  <td className="py-1.5 pr-2 text-right">{Number(s.sales_volume_pct_delta || 0)}%</td>
                  <td className="py-1.5 pr-2 text-right">{s.labor_headcount_delta || 0}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{new Date(s.saved_at).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Slider({ label, value, onChange, min, max, step = 1 }) {
  return (
    <div>
      <label className="label flex justify-between mb-1 text-xs">
        <span>{label}</span>
        <span className="text-noch-green font-mono">{value > 0 ? '+' : ''}{value}{step !== 1 ? '%' : ''}</span>
      </label>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  )
}
function Stat({ label, value, color }) {
  return (
    <div className="bg-noch-dark/50 rounded-lg p-2">
      <p className="text-noch-muted text-[10px] uppercase">{label}</p>
      <p className={`font-mono text-sm font-bold ${color || 'text-white'}`}>{value}</p>
    </div>
  )
}
