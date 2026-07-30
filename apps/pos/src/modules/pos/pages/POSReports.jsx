// POSReports.jsx — branch-level sales reporting.
// Route: /pos/:branchId/reports
// Range presets (today/week/month/custom) + summary KPIs + by-product
// + by-barista. Backed by:
//   - pos_sales_daily view (totals by day, by payment method)
//   - pos_sales_by_product RPC
//   - pos_sales_by_barista RPC

import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Calendar, TrendingUp, ShoppingCart, Users,
} from 'lucide-react'
import {
  getPOSBranch,
  getDailySalesRange, getProductDemandLines, getSalesByBarista,
} from '../lib/pos-supabase'
import { businessToday, businessDayWindow } from '../../../lib/businessDay'
import Layout from '../../../components/Layout'
import BusinessRangePicker from '../../../components/shared/BusinessRangePicker'
import { downloadCsv, ExportButtons } from '../../../lib/exportCsv'
import toast from 'react-hot-toast'

// LOCAL date formatting — never toISOString() here: Libya is UTC+2, so
// converting local midnight to UTC shifts the date to the previous day
// (this exact bug made "Today" report 3 days of sales).
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const PRESETS = [
  { key: 'today', label: 'Today',    days: 0 },
  { key: 'week',  label: 'Week',     days: 6 },
  { key: 'month', label: 'Month',    days: 29 },
  { key: '3months', label: '3 months', days: 89 },
]

const DAY_MODE_OPTIONS = [
  { key: 'all', label: 'All days' },
  { key: 'weekdays', label: 'Weekdays' },
  { key: 'weekend', label: 'Weekend' },
]

const WEEKEND_DAYS = new Set([5, 6])

// Presets are BUSINESS days (5 AM → 5 AM): before 5 AM, "Today" still means
// the evening's trading day that is wrapping up.
function presetRange(preset) {
  const to = businessToday()
  const from = businessToday()
  if (preset === 'today') return { from, to }
  const meta = PRESETS.find(p => p.key === preset)
  from.setDate(from.getDate() - (meta?.days ?? 0))
  return { from, to }
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-noch-green' }) {
  return (
    <div className="card text-center">
      {Icon && <Icon size={16} className={`mx-auto ${color} mb-1`} />}
      <p className="text-noch-muted text-xs">{label}</p>
      <p className="text-white font-bold text-lg">{value}</p>
      {sub && <p className="text-noch-muted text-[10px] mt-0.5">{sub}</p>}
    </div>
  )
}

function formatWhen(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function weekday(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-GB', { weekday: 'short' })
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function dateKey(date) {
  return ymd(new Date(date))
}

function productKey(line) {
  return line.product_id || line.product_name || '(deleted)'
}

function shouldForecastDay(date, mode) {
  const day = new Date(date).getDay()
  if (mode === 'weekend') return WEEKEND_DAYS.has(day)
  if (mode === 'weekdays') return !WEEKEND_DAYS.has(day)
  return true
}

function buildDateList(from, to, mode) {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const dates = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (shouldForecastDay(d, mode)) dates.push(new Date(d))
  }
  return dates
}

function buildForecastRows({ productLines, selectedKeys, forecast, productNames }) {
  const buffer = Math.max(0, Number(forecast.bufferPct) || 0) / 100
  const weeksBack = Math.max(1, Number(forecast.weeksBack) || 6)
  const targetDates = buildDateList(forecast.from, forecast.to, forecast.dayMode)
  const byProductDay = new Map()

  for (const line of productLines) {
    const soldAt = line.pos_orders?.created_at
    if (!soldAt) continue
    const key = productKey(line)
    const day = dateKey(soldAt)
    const mapKey = `${key}|${day}`
    byProductDay.set(mapKey, (byProductDay.get(mapKey) || 0) + (Number(line.quantity) || 0))
  }

  const rows = []
  for (const key of selectedKeys) {
    for (const targetDate of targetDates) {
      const samples = []
      for (let offset = weeksBack; offset >= 1; offset -= 1) {
        const sampleDate = addDays(targetDate, offset * -7)
        samples.push(byProductDay.get(`${key}|${dateKey(sampleDate)}`) || 0)
      }
      const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length
      const recent = samples.slice(-2)
      const recentAvg = recent.reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length)
      const max = Math.max(0, ...samples)
      const baseline = Math.max(avg, recentAvg)
      rows.push({
        productKey: key,
        product: productNames.get(key) || key,
        date: dateKey(targetDate),
        day: weekday(targetDate),
        samples,
        avg,
        recentAvg,
        max,
        suggested: Math.ceil(baseline * (1 + buffer)),
      })
    }
  }
  return rows
}

function combineWeekendRows(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const day = new Date(`${row.date}T00:00:00`).getDay()
    if (!WEEKEND_DAYS.has(day)) {
      grouped.set(`${row.productKey}|${row.date}`, { ...row, period: row.date, periodLabel: `${row.day} ${row.date}` })
      continue
    }
    const date = new Date(`${row.date}T00:00:00`)
    const friday = day === 5 ? date : addDays(date, -1)
    const saturday = addDays(friday, 1)
    const groupKey = `${row.productKey}|${dateKey(friday)}`
    const existing = grouped.get(groupKey) || {
      productKey: row.productKey,
      product: row.product,
      period: `${dateKey(friday)} + ${dateKey(saturday)}`,
      periodLabel: `Weekend ${dateKey(friday)} + ${dateKey(saturday)}`,
      day: 'Fri+Sat',
      avg: 0,
      recentAvg: 0,
      max: 0,
      suggested: 0,
      samples: [],
    }
    existing.avg += row.avg
    existing.recentAvg += row.recentAvg
    existing.max += row.max
    existing.suggested += row.suggested
    existing.samples = existing.samples.concat(row.samples)
    grouped.set(groupKey, existing)
  }
  return [...grouped.values()]
}

export default function POSReports() {
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  // Preset + dates kept in a single state object so a preset change
  // updates both dates in one render (avoids cascading-renders lint).
  const initial = (() => {
    const { from, to } = presetRange('today')
    return { preset: 'today', fromDate: ymd(from), toDate: ymd(to) }
  })()
  const [range, setRange] = useState(initial)
  const { preset, fromDate, toDate } = range

  const choosePreset = (p) => {
    if (p === 'custom') { setRange(r => ({ ...r, preset: 'custom' })); return }
    const { from, to } = presetRange(p)
    setRange({ preset: p, fromDate: ymd(from), toDate: ymd(to) })
  }

  const [loading, setLoading] = useState(true)
  const [daily, setDaily] = useState([])
  const [productLines, setProductLines] = useState([])
  const [byBarista, setByBarista] = useState([])
  const [productToAdd, setProductToAdd] = useState('')
  const [selectedForecastProducts, setSelectedForecastProducts] = useState([])
  const [forecast, setForecast] = useState(() => {
    const start = addDays(new Date(), 1)
    const end = addDays(start, 6)
    return {
      from: ymd(start),
      to: ymd(end),
      dayMode: 'weekend',
      weeksBack: '6',
      bufferPct: '15',
      combineWeekend: true,
    }
  })

  useEffect(() => {
    if (!branchId) return
    getPOSBranch(branchId).then(setBranch).catch(() => {})
  }, [branchId])

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    // Timestamp filters (order lines, barista): business-day boundaries
    // (5 AM → 5 AM) so they match the daily view's buckets exactly.
    const { fromIso, toIso } = businessDayWindow(fromDate, toDate)
    Promise.all([
      // Daily view filters on a DATE column — pass the plain local date strings,
      // NOT the UTC ISO strings (slicing those shifted the range a day back).
      getDailySalesRange(branchId, fromDate, toDate),
      getProductDemandLines(branchId, fromIso, toIso),
      getSalesByBarista(branchId, fromIso, toIso),
    ])
      .then(([d, p, b]) => {
        if (cancelled) return
        setDaily(d)
        setProductLines(
          [...(p || [])].sort((a, b) =>
            new Date(b.pos_orders?.created_at || 0) - new Date(a.pos_orders?.created_at || 0)
          )
        )
        setByBarista(b)
      })
      .catch(err => { if (!cancelled) toast.error(err.message || 'Failed to load reports') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [branchId, fromDate, toDate])

  const totals = useMemo(() => {
    const acc = { orders: 0, gross: 0, discounts: 0, cash: 0, card: 0, split: 0, presto: 0, refunds: 0, voided: 0 }
    for (const row of daily) {
      acc.orders += Number(row.orders) || 0
      acc.gross  += Number(row.gross)  || 0
      acc.discounts += Number(row.discounts) || 0
      acc.cash   += Number(row.cash_sales)  || 0
      acc.card   += Number(row.card_sales)  || 0
      acc.split  += Number(row.split_sales) || 0
      acc.presto += Number(row.presto_sales) || 0
      acc.refunds += Number(row.refunds) || 0
      acc.voided += Number(row.voided) || 0
    }
    return acc
  }, [daily])

  const productExportRows = useMemo(() => productLines.map(line => {
    const soldAt = line.pos_orders?.created_at
    return [
      soldAt || '',
      soldAt ? ymd(new Date(soldAt)) : '',
      weekday(soldAt),
      branch?.name || '',
      line.product_id || '',
      line.product_name || '(deleted)',
      Number(line.quantity || 0).toFixed(2),
      Number(line.total || 0).toFixed(2),
    ]
  }), [branch?.name, productLines])

  const productOptions = useMemo(() => {
    const map = new Map()
    for (const line of productLines) {
      const key = productKey(line)
      const current = map.get(key) || { key, name: line.product_name || '(deleted)', qty: 0, revenue: 0 }
      current.qty += Number(line.quantity) || 0
      current.revenue += Number(line.total) || 0
      map.set(key, current)
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
  }, [productLines])

  const productNames = useMemo(() => new Map(productOptions.map(p => [p.key, p.name])), [productOptions])

  const forecastProductKeys = selectedForecastProducts.filter(key => productNames.has(key))
  const forecastRows = useMemo(
    () => buildForecastRows({
      productLines,
      selectedKeys: forecastProductKeys,
      forecast,
      productNames,
    }),
    [forecast, forecastProductKeys, productLines, productNames]
  )
  const displayedForecastRows = forecast.combineWeekend ? combineWeekendRows(forecastRows) : forecastRows
  const forecastExportRows = displayedForecastRows.map(row => [
    branch?.name || '',
    row.product,
    row.period || row.date,
    row.day,
    Number(row.avg || 0).toFixed(2),
    Number(row.recentAvg || 0).toFixed(2),
    Number(row.max || 0).toFixed(2),
    row.suggested,
    `${forecast.weeksBack} weeks`,
    `${forecast.bufferPct}%`,
  ])

  const addForecastProduct = () => {
    if (!productToAdd) return
    setSelectedForecastProducts(current => current.includes(productToAdd) ? current : [...current, productToAdd])
    setProductToAdd('')
  }

  const removeForecastProduct = (key) => {
    setSelectedForecastProducts(current => current.filter(item => item !== key))
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">Sales Reports</h1>
            <p className="text-noch-muted text-sm">{branch?.name}</p>
          </div>
          <ExportButtons onCsv={() => downloadCsv(`sales_${branch?.name || 'branch'}_${fromDate}_${toDate}`,
            ['Day', 'Orders', 'Gross (LYD)', 'Discounts', 'Cash', 'Card', 'Split', 'Presto', 'Refunds', 'Voided'],
            daily.map(d => [
              d.day,
              d.orders,
              Number(d.gross || 0).toFixed(2),
              Number(d.discounts || 0).toFixed(2),
              Number(d.cash_sales || 0).toFixed(2),
              Number(d.card_sales || 0).toFixed(2),
              Number(d.split_sales || 0).toFixed(2),
              Number(d.presto_sales || 0).toFixed(2),
              Number(d.refunds || 0).toFixed(2),
              Number(d.voided || 0).toFixed(2),
            ]))} />
        </div>

        {/* Range presets */}
        <div className="mb-3">
          <BusinessRangePicker presets={PRESETS} value={{ preset, from: fromDate, to: toDate }} onChange={next => setRange({ preset: next.preset, fromDate: next.from, toDate: next.to })} />
        </div>
        {/* eslint-disable-next-line no-constant-binary-expression */}
        {false && <><div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => choosePreset(p.key)}
              className={`py-2 rounded-lg text-sm border ${
                preset === p.key
                  ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
                  : 'border-noch-border text-noch-muted hover:border-noch-green/20'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => choosePreset('custom')}
            className={`py-2 rounded-lg text-sm border flex items-center justify-center gap-1 ${
              preset === 'custom'
                ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
                : 'border-noch-border text-noch-muted hover:border-noch-green/20'
            }`}
          >
            <Calendar size={12} /> Custom
          </button>
        </div>

        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label block mb-1 text-xs">From</label>
              <input type="date" value={fromDate} onChange={e => setRange(r => ({ ...r, fromDate: e.target.value }))} className="input w-full text-sm" max={toDate} />
            </div>
            <div>
              <label className="label block mb-1 text-xs">To</label>
              <input type="date" value={toDate} onChange={e => setRange(r => ({ ...r, toDate: e.target.value }))} className="input w-full text-sm" min={fromDate} />
            </div>
          </div>
        )}

        </>}

        {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard label="Gross sales" value={`${formatAmount(totals.gross)} LYD`} sub={`${totals.orders.toLocaleString('en-US')} orders`} icon={TrendingUp} />
              <StatCard label="Cash" value={formatAmount(totals.cash)} icon={ShoppingCart} color="text-yellow-400" />
              <StatCard label="Card" value={formatAmount(totals.card)} icon={ShoppingCart} color="text-blue-400" />
              <StatCard label="Split" value={formatAmount(totals.split)} icon={ShoppingCart} color="text-cyan-400" />
              {totals.presto > 0 && <StatCard label="Presto" value={formatAmount(totals.presto)} icon={ShoppingCart} color="text-purple-400" />}
              <StatCard label="Refunds" value={formatAmount(totals.refunds)} color="text-red-400" />
              <StatCard label="Discounts" value={formatAmount(totals.discounts)} color="text-yellow-400" />
              <StatCard label="Cancelled" value={formatAmount(totals.voided)} color="text-red-400" />
              <StatCard label="Avg ticket" value={totals.orders ? formatAmount(totals.gross / totals.orders) : '—'} />
              <StatCard label="Days" value={daily.length} />
            </div>

            {/* Daily breakdown */}
            <div className="card mb-4">
              <h3 className="text-white font-semibold text-sm mb-2">Daily breakdown</h3>
              {daily.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-3">No sales in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-noch-muted">
                        <th className="text-left py-1">Day</th>
                        <th className="text-right py-1">Orders</th>
                        <th className="text-right py-1">Gross</th>
                        <th className="text-right py-1">Cash</th>
                        <th className="text-right py-1">Card</th>
                        <th className="text-right py-1">Split</th>
                        <th className="text-right py-1">Presto</th>
                        <th className="text-right py-1">Refunds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map(d => (
                        <tr key={d.day} className="border-t border-noch-border/40">
                          <td className="py-1 text-white">{d.day}</td>
                          <td className="py-1 text-right text-white">{d.orders}</td>
                          <td className="py-1 text-right text-noch-green">{formatAmount(d.gross)}</td>
                          <td className="py-1 text-right text-yellow-400">{formatAmount(d.cash_sales)}</td>
                          <td className="py-1 text-right text-blue-400">{formatAmount(d.card_sales)}</td>
                          <td className="py-1 text-right text-cyan-400">{formatAmount(d.split_sales)}</td>
                          <td className="py-1 text-right text-purple-400">{formatAmount(d.presto_sales)}</td>
                          <td className="py-1 text-right text-red-400">{formatAmount(d.refunds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Raw product sales lines */}
            <div className="card mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <div>
                  <h3 className="text-white font-semibold text-sm">Products sold</h3>
                  <p className="text-noch-muted text-xs">{productLines.length} sold product lines in this range</p>
                </div>
                <ExportButtons
                  label="Export product CSV"
                  onCsv={() => downloadCsv(`products_sold_${branch?.name || 'branch'}_${fromDate}_${toDate}`,
                    ['Sold at', 'Date', 'Weekday', 'Branch', 'Product ID', 'Product', 'Quantity', 'Line revenue (LYD)'],
                    productExportRows
                  )}
                />
              </div>
              {productLines.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-3">No product sales in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-noch-muted">
                        <th className="text-left py-1">When</th>
                        <th className="text-left py-1">Product</th>
                        <th className="text-right py-1">Qty</th>
                        <th className="text-right py-1">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productLines.slice(0, 80).map((line, idx) => (
                        <tr key={`${line.product_id || line.product_name}-${line.pos_orders?.created_at}-${idx}`} className="border-t border-noch-border/40">
                          <td className="py-1 text-noch-muted whitespace-nowrap">
                            {formatWhen(line.pos_orders?.created_at)}
                          </td>
                          <td className="py-1 text-white min-w-40">{line.product_name || '(deleted)'}</td>
                          <td className="py-1 text-right text-white">{Number(line.quantity || 0).toFixed(2)}</td>
                          <td className="py-1 text-right text-noch-green">{Number(line.total || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {productLines.length > 80 && (
                    <p className="text-noch-muted text-[11px] pt-2">Showing first 80 rows. Export CSV includes all rows.</p>
                  )}
                </div>
              )}
            </div>

            {/* Demand forecast */}
            <div className="card mb-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-white font-semibold text-sm">Demand forecast</h3>
                  <p className="text-noch-muted text-xs">
                    Uses same-weekday sales from the selected history range to suggest order quantities.
                  </p>
                </div>
                <ExportButtons
                  label="Export forecast CSV"
                  onCsv={() => downloadCsv(`demand_forecast_${branch?.name || 'branch'}_${forecast.from}_${forecast.to}`,
                    ['Branch', 'Product', 'Forecast period', 'Day', 'Avg same-day sold', 'Recent avg', 'Historical max', 'Suggested pieces', 'History window', 'Buffer'],
                    forecastExportRows
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="label block mb-1 text-xs">Add product</label>
                  <div className="flex gap-2">
                    <select
                      value={productToAdd}
                      onChange={e => setProductToAdd(e.target.value)}
                      className="input w-full text-sm"
                    >
                      <option value="">Choose from sold products</option>
                      {productOptions.map(product => (
                        <option key={product.key} value={product.key}>
                          {product.name} ({Number(product.qty).toFixed(0)} sold)
                        </option>
                      ))}
                    </select>
                    <button onClick={addForecastProduct} className="btn-primary text-xs px-3 shrink-0">
                      Add
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1 text-xs">Forecast from</label>
                    <input
                      type="date"
                      value={forecast.from}
                      onChange={e => setForecast(f => ({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to }))}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="label block mb-1 text-xs">Forecast to</label>
                    <input
                      type="date"
                      value={forecast.to}
                      onChange={e => setForecast(f => ({ ...f, to: e.target.value }))}
                      className="input w-full text-sm"
                      min={forecast.from}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div>
                  <label className="label block mb-1 text-xs">Days</label>
                  <select
                    value={forecast.dayMode}
                    onChange={e => setForecast(f => ({ ...f, dayMode: e.target.value }))}
                    className="input w-full text-sm"
                  >
                    {DAY_MODE_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1 text-xs">History</label>
                  <select
                    value={forecast.weeksBack}
                    onChange={e => setForecast(f => ({ ...f, weeksBack: e.target.value }))}
                    className="input w-full text-sm"
                  >
                    <option value="4">4 weeks</option>
                    <option value="6">6 weeks</option>
                    <option value="8">8 weeks</option>
                    <option value="12">12 weeks</option>
                  </select>
                </div>
                <div>
                  <label className="label block mb-1 text-xs">Buffer %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={forecast.bufferPct}
                    onChange={e => setForecast(f => ({ ...f, bufferPct: e.target.value }))}
                    className="input w-full text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-noch-muted pt-6">
                  <input
                    type="checkbox"
                    checked={forecast.combineWeekend}
                    onChange={e => setForecast(f => ({ ...f, combineWeekend: e.target.checked }))}
                  />
                  Combine Fri+Sat order
                </label>
              </div>

              {selectedForecastProducts.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedForecastProducts.map(key => (
                    <button
                      key={key}
                      onClick={() => removeForecastProduct(key)}
                      className="px-2 py-1 rounded-lg border border-noch-border text-xs text-white hover:border-red-400/60"
                      title="Remove from forecast"
                    >
                      {productNames.get(key) || key} ×
                    </button>
                  ))}
                </div>
              )}

              {forecastProductKeys.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-3">Add one or more products to forecast order quantities.</p>
              ) : displayedForecastRows.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-3">No forecast dates match these settings.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-noch-muted">
                        <th className="text-left py-1">Product</th>
                        <th className="text-left py-1">Period</th>
                        <th className="text-right py-1">Avg</th>
                        <th className="text-right py-1">Recent</th>
                        <th className="text-right py-1">Max</th>
                        <th className="text-right py-1">Order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedForecastRows.map(row => (
                        <tr key={`${row.productKey}-${row.period || row.date}`} className="border-t border-noch-border/40">
                          <td className="py-1 text-white min-w-40">{row.product}</td>
                          <td className="py-1 text-noch-muted whitespace-nowrap">{row.periodLabel || `${row.day} ${row.date}`}</td>
                          <td className="py-1 text-right text-white">{Number(row.avg || 0).toFixed(1)}</td>
                          <td className="py-1 text-right text-white">{Number(row.recentAvg || 0).toFixed(1)}</td>
                          <td className="py-1 text-right text-white">{Number(row.max || 0).toFixed(1)}</td>
                          <td className="py-1 text-right text-noch-green font-bold">{row.suggested}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* By barista */}
            <div className="card mb-4">
              <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                <Users size={14} /> By barista
              </h3>
              {byBarista.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-3">No served-by data in this range. (Enable PIN-required to capture this.)</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {byBarista.map(b => (
                    <div key={b.user_id || 'unknown'} className="flex justify-between text-sm border-b border-noch-border/40 last:border-0 py-1.5">
                      <span className="text-white">{b.full_name || 'Unattributed'}</span>
                      <span className="text-noch-muted text-xs ml-2 shrink-0">
                        {Number(b.orders || 0).toLocaleString('en-US')} orders · <span className="text-noch-green">{formatAmount(b.revenue)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
