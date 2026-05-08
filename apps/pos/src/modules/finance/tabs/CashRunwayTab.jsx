// CashRunwayTab.jsx — cash on hand, weekly burn, runway, upcoming outflows.

import { useEffect, useState } from 'react'
import { Wallet, AlertTriangle, Edit2, Save, X } from 'lucide-react'
import { getCashRunway, getFinanceSettings, updateFinanceSettings } from '../lib/finance-supabase'
import { lyd } from '../lib/thresholds'
import toast from 'react-hot-toast'

export default function CashRunwayTab() {
  const [data, setData] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)  // 'cash' | 'rates' | 'fixed' | null

  const reload = async () => {
    setLoading(true)
    try {
      const [d, s] = await Promise.all([getCashRunway(null), getFinanceSettings()])
      setData(d); setSettings(s)
    } catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  if (loading || !data || !settings) {
    return <p className="text-noch-muted text-center py-12">Loading…</p>
  }

  const runwayWeeks = data.runway_weeks
  const warnAt = Number(settings.runway_warn_weeks || 8)
  const runwayClass =
    runwayWeeks == null ? 'text-noch-muted'
      : runwayWeeks >= warnAt ? 'text-noch-green'
      : runwayWeeks >= 4 ? 'text-yellow-400'
      : 'text-red-400'

  const usdEquiv = settings.usd_reference_rate_lyd && data.cash_on_hand_lyd
    ? `≈ $${(Number(data.cash_on_hand_lyd) / Number(settings.usd_reference_rate_lyd)).toFixed(0)}` : null

  const save = async (updates) => {
    try {
      const next = await updateFinanceSettings(updates)
      setSettings(next)
      toast.success('Saved')
      setEditing(null)
      // Refresh runway because cash or fixed-OpEx may have changed.
      const d = await getCashRunway(null)
      setData(d)
    } catch (err) { toast.error(err.message || 'Save failed') }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Headline cash card */}
      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-noch-muted text-xs uppercase tracking-wide">Cash on hand</p>
            <p className="text-noch-green text-3xl font-bold">{lyd(data.cash_on_hand_lyd)}</p>
            {usdEquiv && <p className="text-noch-muted text-xs mt-1">{usdEquiv} at {settings.usd_reference_rate_lyd}/USD</p>}
            {settings.cash_on_hand_set_at && (
              <p className="text-noch-muted text-[10px] mt-1">last updated {new Date(settings.cash_on_hand_set_at).toLocaleDateString('en-GB')}</p>
            )}
          </div>
          {editing === 'cash' ? (
            <CashEdit defaultVal={settings.cash_on_hand_lyd} onCancel={() => setEditing(null)}
              onSave={(v) => save({ cash_on_hand_lyd: v, cash_on_hand_set_at: new Date().toISOString() })} />
          ) : (
            <button onClick={() => setEditing('cash')} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
              <Edit2 size={12}/> Update
            </button>
          )}
        </div>
      </div>

      {/* Burn / runway / outflows */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card text-center">
          <p className="text-noch-muted text-xs">Weekly burn</p>
          <p className="text-white text-xl font-bold">{lyd(data.avg_weekly_burn_lyd)}</p>
          <p className="text-noch-muted text-[10px]">avg last 4 weeks (excl. capex)</p>
        </div>
        <div className="card text-center">
          <p className="text-noch-muted text-xs">Weeks of runway</p>
          <p className={`text-3xl font-bold ${runwayClass}`}>
            {runwayWeeks == null ? '—' : runwayWeeks.toFixed(1)}
          </p>
          {runwayWeeks != null && runwayWeeks < warnAt && (
            <p className="text-yellow-300 text-[10px] flex items-center justify-center gap-1 mt-1">
              <AlertTriangle size={10}/> below {warnAt}-week target
            </p>
          )}
        </div>
        <div className="card text-center">
          <p className="text-noch-muted text-xs">Next 30d outflows</p>
          <p className="text-white text-xl font-bold">{lyd(data.upcoming_30d_outflows_lyd)}</p>
          <p className="text-noch-muted text-[10px]">rent + utilities + fixed</p>
        </div>
      </div>

      {/* Fixed outflows editor */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold text-sm">Monthly fixed OpEx</h3>
          {editing !== 'fixed' && (
            <button onClick={() => setEditing('fixed')} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
              <Edit2 size={12}/> Edit
            </button>
          )}
        </div>
        {editing === 'fixed' ? (
          <FixedEdit settings={settings} onCancel={() => setEditing(null)} onSave={save} />
        ) : (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Row label="Rent"      value={lyd(settings.monthly_rent_lyd)} />
            <Row label="Utilities" value={lyd(settings.monthly_utilities_lyd)} />
            <Row label="Other"     value={lyd(settings.monthly_other_fixed_lyd)} />
          </div>
        )}
      </div>

      {/* USD reference rate */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-white font-semibold text-sm">USD reference rate</h3>
            <p className="text-noch-muted text-xs">Display-only. Used for the USD-equivalent line on the cash card.</p>
          </div>
          {editing !== 'rates' && (
            <button onClick={() => setEditing('rates')} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
              <Edit2 size={12}/> Set
            </button>
          )}
        </div>
        {editing === 'rates' ? (
          <RatesEdit settings={settings} onCancel={() => setEditing(null)} onSave={save} />
        ) : (
          <p className="text-white text-lg font-mono">
            {settings.usd_reference_rate_lyd ? `${settings.usd_reference_rate_lyd} LYD per USD` : '— not set'}
            {settings.usd_reference_rate_set_at && (
              <span className="text-noch-muted text-xs ml-2">({new Date(settings.usd_reference_rate_set_at).toLocaleDateString('en-GB')})</span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div>
      <p className="text-noch-muted text-[10px] uppercase">{label}</p>
      <p className="text-white font-mono">{value}</p>
    </div>
  )
}

function CashEdit({ defaultVal, onCancel, onSave }) {
  const [v, setV] = useState(defaultVal ?? 0)
  return (
    <div className="flex items-center gap-2">
      <input type="number" step="0.01" value={v} onChange={e => setV(e.target.value)} className="input py-1 px-2 text-sm w-32" />
      <button onClick={() => onSave(Number(v))} className="text-noch-green"><Save size={14}/></button>
      <button onClick={onCancel} className="text-noch-muted"><X size={14}/></button>
    </div>
  )
}
function FixedEdit({ settings, onCancel, onSave }) {
  const [r, setR] = useState(settings.monthly_rent_lyd ?? 0)
  const [u, setU] = useState(settings.monthly_utilities_lyd ?? 0)
  const [o, setO] = useState(settings.monthly_other_fixed_lyd ?? 0)
  return (
    <div className="grid grid-cols-3 gap-3 items-end">
      {[
        { label: 'Rent',      v: r, set: setR },
        { label: 'Utilities', v: u, set: setU },
        { label: 'Other',     v: o, set: setO },
      ].map(f => (
        <div key={f.label}>
          <label className="text-noch-muted text-[10px] uppercase block">{f.label}</label>
          <input type="number" step="0.01" value={f.v} onChange={e => f.set(e.target.value)} className="input py-1 px-2 text-sm w-full" />
        </div>
      ))}
      <div className="col-span-3 flex justify-end gap-2 mt-2">
        <button onClick={onCancel} className="btn-secondary text-xs">Cancel</button>
        <button onClick={() => onSave({
          monthly_rent_lyd: Number(r),
          monthly_utilities_lyd: Number(u),
          monthly_other_fixed_lyd: Number(o),
        })} className="btn-primary text-xs">Save</button>
      </div>
    </div>
  )
}
function RatesEdit({ settings, onCancel, onSave }) {
  const [v, setV] = useState(settings.usd_reference_rate_lyd ?? '')
  return (
    <div className="flex items-center gap-2">
      <input type="number" step="0.0001" value={v} onChange={e => setV(e.target.value)} className="input py-1 px-2 text-sm w-32" placeholder="e.g. 6.95" />
      <span className="text-noch-muted text-xs">LYD per USD</span>
      <button onClick={() => onSave({
        usd_reference_rate_lyd: Number(v) || null,
        usd_reference_rate_set_at: new Date().toISOString().slice(0, 10),
      })} className="btn-primary text-xs ml-2">Save</button>
      <button onClick={onCancel} className="btn-secondary text-xs">Cancel</button>
    </div>
  )
}
