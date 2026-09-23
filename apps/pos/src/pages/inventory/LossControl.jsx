import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  PackageSearch,
  RefreshCw,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Layout from '../../components/Layout'
import { useLanguage } from '../../contexts/LanguageContext'
import { getPOSBranches } from '../../modules/pos/lib/pos-supabase'
import {
  getLossControlDetail,
  listLossControlRows,
  listLossCountItems,
  recordLossCount,
} from './lib/loss-control'

const quantity = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })
const money = value => `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LYD`

function formatDate(value, arabic, withTime = false) {
  if (!value) return '—'
  return new Date(value).toLocaleString(arabic ? 'ar-LY' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

function CountModal({ branchId, arabic, copy, onClose, onSaved }) {
  const [items, setItems] = useState([])
  const [selectedKey, setSelectedKey] = useState('')
  const [countedQty, setCountedQty] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    listLossCountItems(branchId)
      .then(data => { if (active) setItems(data) })
      .catch(error => toast.error(error.message || copy('Could not load stock items', 'تعذر تحميل عناصر المخزون')))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [branchId, copy])

  const selected = items.find(item => `${item.item_kind}:${item.item_id}` === selectedKey)

  async function submit(event) {
    event.preventDefault()
    if (!selected || countedQty === '' || Number(countedQty) < 0) return
    setSaving(true)
    try {
      await recordLossCount({
        branchId,
        itemKind: selected.item_kind,
        itemId: selected.item_id,
        countedQty,
      })
      toast.success(copy('Physical count recorded', 'تم تسجيل الجرد الفعلي'))
      await onSaved()
      onClose()
    } catch (error) {
      toast.error(error.message || copy('Count could not be saved', 'تعذر حفظ الجرد'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-noch-border bg-noch-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-white text-lg font-bold">{copy('New physical count', 'جرد فعلي جديد')}</h2>
            <p className="text-noch-muted text-xs mt-1">
              {copy('Choose an item and enter what is physically present.', 'اختر العنصر وأدخل الكمية الموجودة فعليًا.')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-noch-muted hover:text-white" aria-label={copy('Close', 'إغلاق')}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-noch-green" /></div>
        ) : (
          <div className="space-y-4 mt-5">
            <div>
              <label className="label">{copy('Stock item', 'عنصر المخزون')}</label>
              <select value={selectedKey} onChange={event => setSelectedKey(event.target.value)} className="input w-full" required>
                <option value="">{copy('Select an item', 'اختر عنصرًا')}</option>
                {items.map(item => (
                  <option
                    key={`${item.item_kind}:${item.item_id}`}
                    value={`${item.item_kind}:${item.item_id}`}
                    disabled={!item.ready_for_loss_check}
                  >
                    {arabic ? item.item_name_ar || item.item_name : item.item_name}
                    {!item.ready_for_loss_check ? ` — ${copy('recipe required', 'تحتاج وصفة')}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div className="rounded-xl border border-noch-border bg-noch-dark/40 px-4 py-3 flex items-center justify-between">
                <span className="text-noch-muted text-sm">{copy('System expects', 'المتوقع في النظام')}</span>
                <span className="text-white font-semibold tabular-nums">{quantity(selected.expected_qty)} {selected.unit}</span>
              </div>
            )}

            <div>
              <label className="label">{copy('Physical quantity', 'الكمية الفعلية')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={countedQty}
                  onChange={event => setCountedQty(event.target.value)}
                  className="input flex-1"
                  required
                />
                <span className="text-noch-muted text-sm min-w-10">{selected?.unit || ''}</span>
              </div>
            </div>

            <button type="submit" disabled={saving || !selected} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
              {copy('Save count', 'حفظ الجرد')}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

function DetailModal({ row, arabic, copy, onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getLossControlDetail(row.check_id)
      .then(data => { if (active) setEvents(data) })
      .catch(error => toast.error(error.message || copy('Could not load movement history', 'تعذر تحميل سجل الحركات')))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [copy, row.check_id])

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-noch-border bg-noch-card shadow-2xl">
        <div className="sticky top-0 bg-noch-card border-b border-noch-border px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-white text-lg font-bold">{arabic ? row.item_name_ar || row.item_name : row.item_name}</h2>
            <p className="text-noch-muted text-xs mt-1">{row.branch_name} · {formatDate(row.period_started_at, arabic)} – {formatDate(row.counted_at, arabic)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-noch-muted hover:text-white" aria-label={copy('Close', 'إغلاق')}><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-noch-dark/40 border border-noch-border p-3">
              <p className="text-noch-muted text-xs">{copy('Expected', 'المتوقع')}</p>
              <p className="text-white font-bold mt-1">{quantity(row.expected_qty)} {row.unit}</p>
            </div>
            <div className="rounded-xl bg-noch-dark/40 border border-noch-border p-3">
              <p className="text-noch-muted text-xs">{copy('Counted', 'الموجود')}</p>
              <p className="text-white font-bold mt-1">{quantity(row.counted_qty)} {row.unit}</p>
            </div>
            <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3">
              <p className="text-red-300 text-xs">{copy('Unaccounted', 'غير مفسّر')}</p>
              <p className="text-red-300 font-bold mt-1">{quantity(row.unaccounted_qty)} {row.unit}</p>
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-3">{copy('Movement timeline', 'التسلسل الزمني للحركات')}</h3>
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-noch-green" /></div>
            ) : events.length === 0 ? (
              <p className="text-noch-muted text-sm">{copy('No movement evidence in this period.', 'لا توجد حركات مسجلة خلال هذه الفترة.')}</p>
            ) : (
              <div className="divide-y divide-noch-border border border-noch-border rounded-xl overflow-hidden">
                {events.map((event, index) => (
                  <div key={`${event.event_at}:${index}`} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-white text-sm font-medium">{event.event_type.replaceAll('_', ' ')}</p>
                      <p className="text-noch-muted text-xs mt-0.5">
                        {formatDate(event.event_at, arabic, true)}{event.actor_name ? ` · ${event.actor_name}` : ''}
                      </p>
                      {event.notes && <p className="text-noch-muted text-xs mt-1">{event.notes}</p>}
                    </div>
                    <span className={`font-semibold tabular-nums ${Number(event.quantity) < 0 ? 'text-red-300' : 'text-noch-green'}`}>
                      {Number(event.quantity) > 0 ? '+' : ''}{quantity(event.quantity)} {row.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LossControl() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = useCallback((english, arabicText) => arabic ? arabicText : english, [arabic])
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [countOpen, setCountOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)

  const load = useCallback(async selectedBranch => {
    setLoading(true)
    try {
      setRows(await listLossControlRows(selectedBranch || null))
    } catch (error) {
      toast.error(error.message || copy('Loss control could not be loaded', 'تعذر تحميل مراقبة الفاقد'))
    } finally {
      setLoading(false)
    }
  }, [copy])

  useEffect(() => {
    getPOSBranches()
      .then(data => setBranches(data))
      .catch(error => toast.error(error.message || copy('Could not load branches', 'تعذر تحميل الفروع')))
  }, [copy])

  useEffect(() => { load(branchId) }, [branchId, load])

  const selectedBranch = useMemo(() => branches.find(branch => branch.id === branchId), [branchId, branches])

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate('/inventory')} className="p-2 text-noch-muted hover:text-white"><ArrowLeft size={18} /></button>
            <div>
              <h1 className="text-white text-xl font-bold">{copy('Loss Control', 'مراقبة الفاقد')}</h1>
              <p className="text-noch-muted text-sm mt-1">{copy('Only stock that could not be accounted for.', 'فقط المخزون الذي لا يمكن تفسيره.')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load(branchId)} disabled={loading} className="p-2 text-noch-muted hover:text-white disabled:opacity-50" title={copy('Refresh', 'تحديث')}>
              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setCountOpen(true)}
              disabled={!branchId}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              <ClipboardCheck size={16} /> {copy('New count', 'جرد جديد')}
            </button>
          </div>
        </div>

        <div className="mb-4">
          <select value={branchId} onChange={event => setBranchId(event.target.value)} className="input w-full sm:w-64">
            <option value="">{copy('All branches', 'كل الفروع')}</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{arabic ? branch.name_ar || branch.name : branch.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-noch-green" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-noch-border bg-noch-card py-14 px-6 text-center">
            <PackageSearch size={34} className="text-noch-muted mx-auto mb-3" />
            <p className="text-white font-semibold">{copy('No unaccounted stock found', 'لا يوجد مخزون غير مفسّر')}</p>
            <p className="text-noch-muted text-sm mt-1">
              {copy('Differences will appear after a physical count.', 'ستظهر الفروقات بعد إجراء جرد فعلي.')}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-noch-border bg-noch-card divide-y divide-noch-border overflow-hidden">
            {rows.map(row => (
              <button key={row.check_id} onClick={() => setSelectedRow(row)} className="w-full px-4 py-4 text-start hover:bg-white/[0.03] flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">{arabic ? row.item_name_ar || row.item_name : row.item_name}</p>
                  <p className="text-noch-muted text-xs mt-1">
                    {row.branch_name} · {formatDate(row.period_started_at, arabic)} – {formatDate(row.counted_at, arabic)}
                  </p>
                </div>
                <div className="text-end shrink-0">
                  <p className="text-red-300 font-bold">{quantity(row.unaccounted_qty)} {row.unit}</p>
                  {Number(row.unaccounted_cost_lyd) > 0 && <p className="text-noch-muted text-xs mt-0.5">{money(row.unaccounted_cost_lyd)}</p>}
                </div>
                <ChevronRight size={17} className="text-noch-muted shrink-0 rtl:rotate-180" />
              </button>
            ))}
          </div>
        )}
      </div>

      {countOpen && branchId && (
        <CountModal
          branchId={branchId}
          branch={selectedBranch}
          arabic={arabic}
          copy={copy}
          onClose={() => setCountOpen(false)}
          onSaved={() => load(branchId)}
        />
      )}
      {selectedRow && <DetailModal row={selectedRow} arabic={arabic} copy={copy} onClose={() => setSelectedRow(null)} />}
    </Layout>
  )
}
