import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import Layout from '../../components/Layout'
import { businessToday, getCEOMoney, monthToDate, saveCEOBalances } from './lib/ceo-money'

const money = value => value == null ? '—' : `${Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LYD`
const inputClass = 'input w-full'

export default function CEOOverview() {
  const [period, setPeriod] = useState(monthToDate)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ date: businessToday(), cash: '', bank: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError('')
    if (!period.from || !period.to || period.from > period.to) {
      setError('Choose a start date on or before the end date.')
      setLoading(false)
      return
    }
    setLoading(true)
    getCEOMoney(period.from, period.to).then(result => {
      if (!cancelled) setData(result)
    }).catch(err => {
      if (!cancelled) setError(err.message || 'Could not load the money overview.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [period.from, period.to, revision])

  async function save(event) {
    event.preventDefault()
    setSaveError('')
    setSaving(true)
    try {
      await saveCEOBalances(form)
      setEditing(false)
      if (form.date > period.to) setPeriod(current => ({ ...current, to: form.date }))
      setRevision(current => current + 1)
    } catch (err) { setSaveError(err.message || 'Could not save balances.') }
    finally { setSaving(false) }
  }

  const observation = data?.observation
  const reconciled = data?.baseline_date != null
  const differs = reconciled && (Math.abs(Number(data.cash_difference)) >= 0.01 || Math.abs(Number(data.bank_difference)) >= 0.01)

  return <Layout>
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-noch-green text-sm font-medium">Company overview</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Your money, at a glance</h1>
        </div>
        <Link to="/finance" className="text-noch-muted text-sm hover:text-white">Open Finance →</Link>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-noch-muted text-sm w-[calc(50%-6px)] sm:w-auto sm:flex-1 min-w-0">From<input aria-label="From" type="date" className={`${inputClass} min-w-0`} value={period.from} onChange={e => setPeriod({ ...period, from: e.target.value })} /></label>
        <label className="text-noch-muted text-sm w-[calc(50%-6px)] sm:w-auto sm:flex-1 min-w-0">To<input aria-label="To" type="date" className={`${inputClass} min-w-0`} value={period.to} onChange={e => setPeriod({ ...period, to: e.target.value })} /></label>
        <button className="btn-secondary" onClick={() => setPeriod(monthToDate())}>This month</button>
        <button className="btn-secondary p-2" aria-label="Refresh overview" onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      <div aria-busy={loading} className="grid sm:grid-cols-3 gap-4">
        {[
          ['Money in', data?.money_in, 'text-noch-green', 'Cash receipts, corrected payment methods and bank settlements'],
          ['Money out', data?.money_out, 'text-red-300', 'Paid expenses, salaries and cash refunds'],
          ['Balance', data?.balance, 'text-white', 'Money in minus money out for these dates'],
        ].map(([label, value, color, hint]) => <section key={label} className="bg-noch-card border border-noch-border rounded-2xl p-4 sm:p-5">
          <h2 className="text-noch-muted text-sm">{label}</h2>
          <p className={`text-2xl md:text-3xl font-bold mt-2 tabular-nums ${color}`}>{loading ? '…' : money(value)}</p>
          <p className="text-noch-muted text-xs mt-2">{hint}</p>
        </section>)}
      </div>
      <p className="text-xs text-noch-muted">Cash and bank movements in LYD. Card and Presto sales count when settlement is recorded. Transfers between cash and bank do not change money in or out.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <section className="bg-noch-card border border-noch-border rounded-xl p-5">
          <h2 className="text-sm text-noch-muted">Payroll estimate for these dates</h2>
          <p className="text-xl text-white font-semibold mt-2">{money(data?.payroll_estimate)}</p>
          <p className="text-xs text-noch-muted mt-2">Monthly payroll prorated to the selected days. An estimate only; paid salaries are already in money out.</p>
          {!!data?.missing_payroll_start_dates && <p className="text-xs text-amber-300 mt-2">Some employment start dates are missing; the estimate assumes those employees worked the selected days.</p>}
        </section>
        <section className="bg-noch-card border border-noch-border rounded-xl p-5">
          <h2 className="text-sm text-noch-muted">Invoices entered</h2>
          <p className="text-xl text-white font-semibold mt-2">{money(data?.invoice_total)}</p>
          <p className="text-xs text-noch-muted mt-2">{data?.invoice_count ?? '—'} recorded expenses dated within this range, including pending and unpaid invoices. Rejected invoices excluded.</p>
        </section>
      </div>
      <section className="bg-noch-card border border-noch-border rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-center gap-3">
          <div><h2 className="text-lg text-white font-semibold">Cash & bank balances</h2><p className="text-xs text-noch-muted">{observation ? `Last entered: ${observation.as_of} · All branches combined` : 'Enter your actual balances to start checking differences.'}</p></div>
          <button className="btn-secondary" onClick={() => {
            setForm({ date: businessToday(), cash: observation?.cash_lyd ?? '', bank: observation?.bank_lyd ?? '', notes: '' })
            setSaveError(''); setEditing(true)
          }}>Update balances</button>
        </div>
        {editing ? <form onSubmit={save} className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm text-noch-muted">Balance date<input aria-label="Balance date" type="date" required max={businessToday()} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputClass} /></label>
            <label className="text-sm text-noch-muted">Actual cash (LYD)<input aria-label="Actual cash (LYD)" type="number" step="0.01" min="0" required value={form.cash} onChange={e => setForm({ ...form, cash: e.target.value })} className={inputClass} /></label>
            <label className="text-sm text-noch-muted">Actual bank (LYD)<input aria-label="Actual bank (LYD)" type="number" step="0.01" required value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} className={inputClass} /></label>
          </div>
          <p className="text-xs text-noch-muted">Enter closing balances for this date. For today, update after the day's transactions are recorded. Previous entries remain in the history.</p>
          <input aria-label="Balance notes" placeholder="Note (optional)" className={inputClass} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          {saveError && <p role="alert" className="text-red-400 text-sm">{saveError}</p>}
          <div className="flex gap-2"><button disabled={saving} className="btn-primary" type="submit">{saving ? 'Saving…' : 'Save balances'}</button><button disabled={saving} className="btn-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
        </form> : <>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-sm text-noch-muted">Cash counted</p><p className="text-2xl text-white font-semibold">{money(observation?.cash_lyd)}</p></div>
            <div><p className="text-sm text-noch-muted">Bank balance</p><p className="text-2xl text-white font-semibold">{money(observation?.bank_lyd)}</p></div>
          </div>
          {reconciled ? <div className={`rounded-xl p-3 text-sm ${differs ? 'bg-amber-500/10 text-amber-200' : 'bg-noch-green/10 text-noch-green'}`}>
            <p className="font-semibold">{differs ? 'Difference to check' : 'Balances match recorded movements'}</p>
            <p className="mt-1">Cash: {money(data.cash_difference)} · Bank: {money(data.bank_difference)}</p>
            <p className="text-xs mt-1">Actual minus expected since {data.baseline_date}. Expected cash {money(data.expected_cash)}; bank {money(data.expected_bank)}. Missing payments or settlements can explain a difference.</p>
          </div> : <p className="text-xs text-noch-muted">The first entry sets your starting point. Enter balances for a later date to check them against recorded movements.</p>}
        </>}
      </section>
      {!!data?.reconstructed_cash_events && <p className="text-xs text-noch-muted">This period includes reconstructed historical cash records. Differences may reflect missing historical entries.</p>}
    </main>
  </Layout>
}
