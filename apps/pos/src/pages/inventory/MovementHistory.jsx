// MovementHistory.jsx — pos_inventory_movements browser with filters
// Route: /inventory/movements

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, History, RefreshCw } from 'lucide-react'
import Layout from '../../components/Layout'
import { useLanguage } from '../../contexts/LanguageContext'
import { getPOSBranches } from '../../modules/pos/lib/pos-supabase'
import { listMovementHistory } from './lib/warehouse'
import toast from 'react-hot-toast'

const MOVEMENT_TYPES = [
  { value: '', label: 'All types' },
  { value: 'sale', label: 'Sale' },
  { value: 'sale_consumption', label: 'Coffee consumed' },
  { value: 'refund_reversal', label: 'Coffee refund reversal' },
  { value: 'void_reversal', label: 'Coffee void reversal' },
  { value: 'transfer_in', label: 'Transfer in' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'used', label: 'Used' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost', label: 'Lost' },
  { value: 'thrown_away', label: 'Thrown away' },
  { value: 'expired', label: 'Expired' },
  { value: 'staff_meal', label: 'Staff meal' },
  { value: 'count_correction', label: 'Count correction' },
]

const TYPE_META = {
  sale:              { label: 'Sale',             cls: 'bg-noch-card text-noch-muted border-noch-border' },
  sale_consumption:  { label: 'Coffee used',      cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  refund_reversal:   { label: 'Refund reversal',  cls: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
  void_reversal:     { label: 'Void reversal',    cls: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
  transfer_in:       { label: 'Transfer in',      cls: 'bg-green-500/10 text-green-400 border-green-500/30' },
  adjustment:        { label: 'Adjustment',       cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  used:              { label: 'Used',             cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  damaged:           { label: 'Damaged',          cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  lost:              { label: 'Lost',             cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  thrown_away:       { label: 'Thrown away',      cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  expired:           { label: 'Expired',          cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  staff_meal:        { label: 'Staff meal',       cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  count_correction:  { label: 'Count correction', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
}

function TypeBadge({ type }) {
  const m = TYPE_META[type] || { label: type, cls: 'bg-noch-card text-noch-muted border-noch-border' }
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${m.cls}`}>{m.label}</span>
  )
}

export default function MovementHistory() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = (english, arabicText) => arabic ? arabicText : english
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [movementType, setMovementType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPOSBranches().then(setBranches).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listMovementHistory({
        branchId: branchId || undefined,
        movementType: movementType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      setRows(data)
    } catch (err) {
      toast.error(err.message || (arabic ? 'تعذر تحميل الحركات' : 'Failed to load movements'))
    } finally {
      setLoading(false)
    }
  }, [arabic, branchId, movementType, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/inventory')} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <History size={18} className="text-noch-green" />
              {copy('Movement History', 'سجل حركات المخزون')}
            </h1>
            <p className="text-noch-muted text-sm">{copy('Receipts, sales, waste, transfers, and adjustments', 'الاستلام والمبيعات والهدر والتحويلات والتعديلات')}</p>
          </div>
          <button onClick={load} className="p-2 text-noch-muted hover:text-white rounded-lg hover:bg-noch-card" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Filter bar */}
        <div className="bg-noch-card border border-noch-border rounded-xl p-3 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className="input w-full">
            <option value="">{copy('All branches', 'كل الفروع')}</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={movementType} onChange={e => setMovementType(e.target.value)} className="input w-full">
            {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input w-full" title="From date" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input w-full" title="To date" />
        </div>

        {/* Table */}
        <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-[140px_1fr_110px_130px_130px_90px] gap-2 px-4 py-2.5 border-b border-noch-border text-xs font-semibold text-noch-muted uppercase tracking-wide">
            <span>{copy('Date', 'التاريخ')}</span>
            <span>{copy('Product', 'المنتج')}</span>
            <span>{copy('Type', 'النوع')}</span>
            <span>{copy('Location', 'الموقع')}</span>
            <span className="text-right">{copy('Before → After', 'قبل ← بعد')}</span>
            <span className="text-right">{copy('Qty', 'الكمية')}</span>
          </div>
          {loading ? (
            <p className="text-noch-muted text-center py-10 text-sm">{copy('Loading…', 'جارٍ التحميل…')}</p>
          ) : rows.length === 0 ? (
            <p className="text-noch-muted text-center py-10 text-sm">{copy('No movements match these filters', 'لا توجد حركات تطابق هذه الفلاتر')}</p>
          ) : (
            <div className="divide-y divide-noch-border/50">
              {rows.map(m => (
                <div key={m.id} className="grid grid-cols-2 sm:grid-cols-[140px_1fr_110px_130px_130px_90px] gap-2 px-4 py-2.5 items-center">
                  <p className="text-noch-muted text-xs">
                    {new Date(m.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{m.product_name}</p>
                    {m.notes && <p className="text-noch-muted text-xs truncate">{m.notes}</p>}
                  </div>
                  <div><TypeBadge type={m.movement_type} /></div>
                  <p className="text-noch-muted text-xs truncate">{m.branch_name}</p>
                  <p className="text-noch-muted text-xs text-right tabular-nums">
                    {m.stock_before != null ? `${parseFloat(m.stock_before)} ${m.unit || ''}` : '—'} → {m.stock_after != null ? `${parseFloat(m.stock_after)} ${m.unit || ''}` : '—'}
                  </p>
                  <p className={`text-sm font-bold text-right tabular-nums ${parseFloat(m.quantity) < 0 ? 'text-red-400' : 'text-noch-green'}`}>
                    {parseFloat(m.quantity) > 0 ? '+' : ''}{parseFloat(m.quantity)} {m.unit || ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
