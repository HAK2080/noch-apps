import { useEffect, useState } from 'react'
import { getCEOForecast, saveCEOForecast } from './lib/ceo-money'

const money = value => value == null ? '—' : `${Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LYD`

export default function CEOForecast({ revision = 0, onForecastChange }) {
  const [plan, setPlan] = useState(null)
  const [result, setResult] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    onForecastChange?.({ status: 'loading', data: null })
    getCEOForecast().then(data => {
      if (!cancelled) { setPlan(data); setResult(data); setDirty(false); setError(''); onForecastChange?.({ status: 'ready', data }) }
    }).catch(err => { if (!cancelled) { setError(err.message); setResult(null); onForecastChange?.({ status: 'error', data: null }) } })
    return () => { cancelled = true }
  }, [revision, onForecastChange])

  function update(change) { setPlan(current => ({ ...current, ...change })); setDirty(true); setResult(null); onForecastChange?.({ status: 'dirty', data: null }) }
  function itemChange(id, change) { update({ items: plan.items.map(item => item.id === id ? { ...item, ...change } : item) }) }
  async function calculate(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null); onForecastChange?.({ status: 'loading', data: null })
    try {
      const data = await saveCEOForecast(plan)
      setPlan(data); setResult(data); setDirty(false); onForecastChange?.({ status: 'ready', data })
    } catch (err) { setError(err.message || 'Could not save forecast.'); onForecastChange?.({ status: 'error', data: null }) }
    finally { setBusy(false) }
  }
  return <section className="bg-noch-card border border-noch-border rounded-2xl p-5 space-y-4">
    <div><h2 className="text-lg font-semibold text-white">Plan the rest of this month</h2>
      <p className="text-xs text-noch-muted mt-1">Saved planning only. These items never create payments or accounting entries.</p></div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!plan ? <p className="text-noch-muted">{error ? 'Forecast unavailable.' : 'Loading forecast…'}</p> : <form onSubmit={calculate} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <label className="block text-sm text-noch-muted">Forecast through<input aria-label="Forecast through" className="input block mt-1 max-w-full" type="date" required min={plan.today} max={plan.month_end} value={plan.target_date} onChange={e => update({ target_date: e.target.value })} /></label>
        <p className="text-sm text-noch-muted">Starting funds: <strong className="text-white">{money(plan.starting_funds)}</strong>{plan.balance_date ? ` · Count dated ${plan.balance_date}, adjusted for recorded movements on later dates through ${plan.today}.` : ' · Enter an actual cash/bank count below to calculate cash left.'}</p>
        <p className="text-xs text-amber-200">Use closing counts. Remove or exclude a planned item once paid or received to avoid counting it twice. Review the payroll estimate for payments already made separately.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {plan.items.map((item, index) => <div key={item.id} className="border border-noch-border rounded-xl p-3 space-y-2 min-w-0">
            <input aria-label={`Item ${index + 1} name`} placeholder="Lease, security, expected sales…" className="input w-full" required maxLength={150} value={item.label} onChange={e => itemChange(item.id, { label: e.target.value })} />
            <div className="flex gap-2">
              <select aria-label={`Item ${index + 1} direction`} className="input min-w-0 w-1/2" value={item.direction} onChange={e => itemChange(item.id, { direction: e.target.value })}><option value="out">− Payment</option><option value="in">＋ Money incoming</option></select>
              <input aria-label={`Item ${index + 1} amount`} className="input min-w-0 w-1/2" type="number" required min="0.01" max="1000000000" step="0.01" placeholder="LYD" value={item.amount} onChange={e => itemChange(item.id, { amount: e.target.value })} />
            </div>
            <label className="block text-xs text-noch-muted">Expected date<input aria-label={`Item ${index + 1} date`} className="input w-full mt-1 min-w-0" type="date" required value={item.due_date} onChange={e => itemChange(item.id, { due_date: e.target.value })} /></label>
            <div className="flex justify-between gap-2 text-sm"><label className="text-noch-muted"><input type="checkbox" checked={item.included} onChange={e => itemChange(item.id, { included: e.target.checked })} /> Include</label><button type="button" className="text-red-300" aria-label={`Remove item ${index + 1}`} onClick={() => update({ items: plan.items.filter(row => row.id !== item.id) })}>Remove</button></div>
            {item.due_date > plan.target_date && <p className="text-xs text-amber-200">After forecast date; excluded from this calculation.</p>}
          </div>)}
          <button type="button" className="btn-secondary border-dashed min-h-24" onClick={() => update({ items: [...plan.items, { id: crypto.randomUUID(), label: '', direction: 'out', amount: '', due_date: plan.target_date, included: true }] })}>＋ Add expected item</button>
        </div>
        <div className="space-y-2 text-sm text-noch-muted">
          <label className="block"><input type="checkbox" checked={plan.rent_covered} onChange={e => update({ rent_covered: e.target.checked })} /> Lease/rent is covered in this plan, already paid, or not due</label>
          <label className="block"><input type="checkbox" checked={plan.bills_covered} onChange={e => update({ bills_covered: e.target.checked })} /> Security and other bills are covered, already paid, or not due</label>
        </div>
        {(!plan.rent_covered || !plan.bills_covered) && <p className="text-amber-200 text-sm">Forecast incomplete: {!plan.rent_covered && 'lease/rent needs review'}{!plan.rent_covered && !plan.bills_covered && '; '}{!plan.bills_covered && 'security/other bills need review'}.</p>}
        <button className="btn-primary" type="submit">{busy ? 'Calculating…' : 'Calculate & save forecast'}</button>
      </fieldset>
      {dirty && <p className="text-sm text-amber-200">Unsaved changes. Calculate to update the forecast.</p>}
      {result && <>
        <div className="grid sm:grid-cols-3 gap-3">
          {[['Expected incoming', result.expected_income], ['Expected payments', result.expected_payments], ['Cash left after payments', result.cash_left]].map(([label, amount]) => <div key={label} className="rounded-xl bg-noch-dark p-4"><h3 className="text-xs text-noch-muted">{label}</h3><p className={`text-xl font-semibold mt-2 ${amount != null && amount < 0 ? 'text-red-300' : 'text-white'}`}>{money(amount)}</p></div>)}
        </div>
        <p className="text-xs text-noch-muted">Starting funds + expected incoming − expected payments. Included items due by {result.target_date}, including overdue items. {result.saved_at ? 'Plan saved; funds refresh from recorded movements when loaded.' : 'Suggested payroll only; review and save your plan.'}</p>
      </>}
    </form>}
  </section>
}
