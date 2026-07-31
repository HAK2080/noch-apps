import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, MapPin, Package, RefreshCw, Search, X } from 'lucide-react'
import Layout from '../../components/Layout'
import BackButton from '../../components/shared/BackButton'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import {
  getInventoryLocations,
  upsertInventoryLocationStock,
} from './lib/inventory-supabase'
import { buildInventoryControlReport } from './lib/inventoryIntelligence'
import toast from 'react-hot-toast'

function quantity(value) {
  if (value == null) return '—'
  return Number(value).toLocaleString('en-GB', { maximumFractionDigits: 3 })
}

function CountModal({ item, locations, onClose, onSaved, copy }) {
  const [scope, setScope] = useState('global')
  const [locationId, setLocationId] = useState(locations[0]?.id || '')
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const counted = Number(value)
    if (!Number.isFinite(counted) || counted < 0) {
      toast.error(copy('Enter a quantity of zero or more', 'أدخل كمية تساوي صفرًا أو أكثر'))
      return
    }
    if (scope === 'location' && !locationId) {
      toast.error(copy('Select a location', 'اختر موقعًا'))
      return
    }
    setSaving(true)
    try {
      if (scope === 'global') {
        const { error } = await supabase.rpc('record_stock_count', {
          p_ingredient_id: item.ingredientId,
          p_counted_qty: counted,
          p_unit: item.unit || null,
          p_notes: notes.trim() || null,
        })
        if (error) throw error
      } else {
        await upsertInventoryLocationStock({
          ingredientId: item.ingredientId,
          locationId,
          qty: counted,
          unit: item.unit,
          notes: notes.trim(),
        })
      }
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
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-noch-border">
          <div>
            <h2 className="text-white font-bold">{copy('Record physical count', 'تسجيل جرد فعلي')}</h2>
            <p className="text-noch-muted text-sm mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-noch-muted hover:text-white">
            <X size={19} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label block mb-1">{copy('Count scope', 'نطاق الجرد')}</label>
            <select value={scope} onChange={event => setScope(event.target.value)} className="input w-full">
              <option value="global">{copy('Business-wide ingredient balance', 'رصيد المكوّن على مستوى المنشأة')}</option>
              <option value="location">{copy('Specific storage location', 'موقع تخزين محدد')}</option>
            </select>
          </div>
          {scope === 'location' && (
            <div>
              <label className="label block mb-1">{copy('Location', 'الموقع')}</label>
              <select value={locationId} onChange={event => setLocationId(event.target.value)} className="input w-full">
                <option value="">{copy('Select location…', 'اختر موقعًا…')}</option>
                {locations.map(location => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label block mb-1">{copy('Counted quantity', 'الكمية المعدودة')} ({item.unit})</label>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={value}
              onChange={event => setValue(event.target.value)}
              className="input w-full text-xl font-bold text-center"
              autoFocus
            />
          </div>
          <div>
            <label className="label block mb-1">{copy('Evidence note (optional)', 'ملاحظة الدليل (اختياري)')}</label>
            <input
              value={notes}
              onChange={event => setNotes(event.target.value)}
              className="input w-full"
              placeholder={copy('e.g. shelf count by Ahmed', 'مثال: جرد الرف بواسطة أحمد')}
            />
          </div>
          <button onClick={save} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {saving && <Loader2 size={15} className="animate-spin" />}
            {copy('Save count', 'حفظ الجرد')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StockManager() {
  const { profile, isOwner } = useAuth()
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = (english, arabicText) => arabic ? arabicText : english
  const canCount = isOwner || profile?.role === 'supervisor'
  const [sourceRows, setSourceRows] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [countItem, setCountItem] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [statusResult, locationResult] = await Promise.all([
      supabase.rpc('inventory_control_status_v2'),
      getInventoryLocations().then(data => ({ data })).catch(error => ({ error })),
    ])
    const queryError = statusResult.error || locationResult.error
    if (queryError) {
      setError(queryError.message || (arabic ? 'تعذر تحميل المخزون' : 'Inventory could not be loaded'))
    } else {
      setSourceRows(statusResult.data || [])
      setLocations(locationResult.data || [])
    }
    setLoading(false)
  }, [arabic])

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.rpc('inventory_control_status_v2'),
      getInventoryLocations().then(data => ({ data })).catch(error => ({ error })),
    ]).then(([statusResult, locationResult]) => {
      if (!active) return
      const queryError = statusResult.error || locationResult.error
      if (queryError) {
        setError(queryError.message || (arabic ? 'تعذر تحميل المخزون' : 'Inventory could not be loaded'))
      } else {
        setSourceRows(statusResult.data || [])
        setLocations(locationResult.data || [])
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [arabic])

  const report = useMemo(() => buildInventoryControlReport(sourceRows), [sourceRows])
  const filteredRows = report.rows.filter(item => {
    const matches = !search
      || item.name.toLowerCase().includes(search.toLowerCase())
      || item.nameAr.includes(search)
    const needsAttention = item.countIsStale
      || !item.recipeUsageAvailable
      || item.locationCount === 0
      || (item.locationVariance != null && Math.abs(item.locationVariance) > 0.001)
      || ['out', 'below_minimum', 'near_minimum'].includes(item.status)
    return matches && (!attentionOnly || needsAttention)
  })

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <BackButton to="/inventory" />
        <div className="flex items-start justify-between gap-4 mt-3 mb-5">
          <div>
            <h1 className="text-white font-bold text-2xl">{copy('Physical Stock Counts', 'الجرد الفعلي للمخزون')}</h1>
            <p className="text-noch-muted text-sm mt-1">
              {copy(
                'Record what is physically present. Location totals are compared with the business-wide ingredient balance; differences remain visible.',
                'سجّل الموجود فعليًا. تتم مقارنة إجمالي المواقع برصيد المكوّن على مستوى المنشأة، وتبقى الفروقات ظاهرة.',
              )}
            </p>
          </div>
          <button onClick={load} disabled={loading} className="p-2 text-noch-muted hover:text-white disabled:opacity-50">
            {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="card p-3">
            <p className="text-noch-muted text-xs">{copy('Ingredients', 'المكوّنات')}</p>
            <p className="text-white font-bold text-xl">{report.total}</p>
          </div>
          <div className="card p-3">
            <p className="text-noch-muted text-xs">{copy('Stale counts', 'جرد قديم')}</p>
            <p className={report.staleCount ? 'text-yellow-200 font-bold text-xl' : 'text-noch-green font-bold text-xl'}>{report.staleCount}</p>
          </div>
          <div className="card p-3">
            <p className="text-noch-muted text-xs">{copy('No location count', 'بلا جرد للموقع')}</p>
            <p className={report.missingLocationCount ? 'text-amber-300 font-bold text-xl' : 'text-noch-green font-bold text-xl'}>{report.missingLocationCount}</p>
          </div>
          <div className="card p-3">
            <p className="text-noch-muted text-xs">{copy('Location variances', 'فروقات المواقع')}</p>
            <p className={report.locationVarianceCount ? 'text-red-300 font-bold text-xl' : 'text-noch-green font-bold text-xl'}>{report.locationVarianceCount}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-noch-muted" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={copy('Search ingredients…', 'ابحث عن المكوّنات…')}
              className="input w-full ps-9"
            />
          </div>
          <button
            onClick={() => setAttentionOnly(value => !value)}
            className={`btn-secondary flex items-center justify-center gap-2 ${attentionOnly ? 'border-amber-400/50 text-amber-200' : ''}`}
          >
            <AlertTriangle size={14} />
            {copy('Attention only', 'الاستثناءات فقط')}
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>
        ) : loading ? (
          <div className="py-20 text-center text-noch-muted">{copy('Loading…', 'جارٍ التحميل…')}</div>
        ) : filteredRows.length === 0 ? (
          <div className="card py-12 text-center">
            <Package size={24} className="text-noch-muted mx-auto mb-2" />
            <p className="text-noch-muted">{copy('No ingredients match', 'لا توجد مكوّنات مطابقة')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredRows.map(item => {
              const variance = item.locationVariance
              return (
                <div key={item.ingredientId} className="rounded-xl border border-noch-border bg-noch-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{arabic ? item.nameAr || item.name : item.name}</p>
                      {arabic && item.nameAr && <p className="text-noch-muted text-xs">{item.name}</p>}
                    </div>
                    {item.countIsStale ? (
                      <span className="text-[11px] text-yellow-200 border border-yellow-400/30 rounded-full px-2 py-1">
                        {copy('Count now', 'يجب الجرد')}
                      </span>
                    ) : (
                      <CheckCircle2 size={17} className="text-noch-green" />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                    <div className="rounded-lg bg-noch-dark border border-noch-border p-3">
                      <p className="text-noch-muted text-xs">{copy('Business balance', 'رصيد المنشأة')}</p>
                      <p className="text-white font-bold mt-1">{quantity(item.countedQty)} {item.unit}</p>
                    </div>
                    <div className="rounded-lg bg-noch-dark border border-noch-border p-3">
                      <p className="text-noch-muted text-xs">{copy('Location total', 'إجمالي المواقع')}</p>
                      <p className={variance != null && Math.abs(variance) > 0.001 ? 'text-amber-300 font-bold mt-1' : 'text-white font-bold mt-1'}>
                        {item.locationCount ? `${quantity(item.locationQty)} ${item.unit}` : copy('Not counted', 'لم يُجرد')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 text-xs space-y-1">
                    <p className="text-noch-muted flex justify-between gap-3">
                      <span>{copy('Recipe-backed estimate', 'التقدير المبني على الوصفة')}</span>
                      <span className={item.recipeUsageAvailable ? 'text-white' : 'text-red-300'}>
                        {item.recipeUsageAvailable ? `${quantity(item.theoreticalQty)} ${item.unit}` : copy('Unavailable', 'غير متاح')}
                      </span>
                    </p>
                    <p className="text-noch-muted flex justify-between gap-3">
                      <span>{copy('Location reconciliation', 'مطابقة المواقع')}</span>
                      <span className={variance == null ? 'text-noch-muted' : Math.abs(variance) > 0.001 ? 'text-amber-300' : 'text-noch-green'}>
                        {variance == null ? copy('Waiting for counts', 'بانتظار الجرد') : `${variance > 0 ? '+' : ''}${quantity(variance)} ${item.unit}`}
                      </span>
                    </p>
                  </div>

                  {canCount && (
                    <button onClick={() => setCountItem(item)} className="btn-secondary w-full mt-4 flex items-center justify-center gap-2">
                      <MapPin size={14} />
                      {copy('Record count', 'تسجيل جرد')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!canCount && (
          <p className="text-noch-muted text-xs mt-4">
            {copy('Physical quantities can be changed by owners and supervisors only.', 'يمكن للمالك والمشرف فقط تعديل الكميات الفعلية.')}
          </p>
        )}
      </div>

      {countItem && (
        <CountModal
          item={countItem}
          locations={locations}
          onClose={() => setCountItem(null)}
          onSaved={load}
          copy={copy}
        />
      )}
    </Layout>
  )
}
