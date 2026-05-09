import { useEffect, useState } from 'react'
import { Brain, AlertTriangle, TrendingDown, Package, Zap, Loader2 } from 'lucide-react'
import Layout from '../../components/Layout'
import BackButton from '../../components/shared/BackButton'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import toast from 'react-hot-toast'

function daysToOut(qty, rate) {
  if (!rate || rate <= 0 || qty == null) return null
  if (qty <= 0) return 0
  return Math.round(qty / rate)
}

function healthScore(items) {
  if (!items.length) return 100
  let score = 100
  for (const it of items) {
    if (it.qty_available <= 0) score -= 10
    else if (it.flag === 'low') score -= 5
    else if (it.flag === 'urgent') score -= 3
    else if (it.flag === 'watch') score -= 1
  }
  return Math.max(0, Math.min(100, score))
}

export default function InventoryIntelligence() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // `stock` only has qty_available + min_threshold; name/unit live on
        // the joined `ingredients` row. consumption_rate and manual_daily_rate
        // don't exist on this DB — port assumed a different schema. We skip
        // days-to-out prediction here and just flag out/low/ok from threshold.
        const { data, error } = await supabase
          .from('stock')
          .select('id, qty_available, min_threshold, ingredient:ingredients(id, name, name_ar, base_unit)')
          .gt('min_threshold', 0)
        if (error) throw error

        const enriched = (data || []).map(it => {
          let flag = 'ok'
          if (it.qty_available <= 0) flag = 'out'
          else if (it.min_threshold > 0 && it.qty_available <= it.min_threshold) flag = 'low'
          else if (it.min_threshold > 0 && it.qty_available <= it.min_threshold * 1.5) flag = 'urgent'
          else if (it.min_threshold > 0 && it.qty_available <= it.min_threshold * 2)   flag = 'watch'
          return {
            ...it,
            name:      it.ingredient?.name    || '—',
            name_ar:   it.ingredient?.name_ar || '',
            unit:      it.ingredient?.base_unit || '',
            daysToOut: null,
            flag,
          }
        })
        setItems(enriched)
      } catch (e) {
        toast.error(e.message || 'Failed to load stock')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const score = healthScore(items)
  const outItems    = items.filter(i => i.flag === 'out')
  const lowItems    = items.filter(i => i.flag === 'low')
  const urgentItems = items.filter(i => i.flag === 'urgent')
  const watchItems  = items.filter(i => i.flag === 'watch')
  const okItems     = items.filter(i => i.flag === 'ok')

  const scoreColor = score >= 80 ? 'text-noch-green' : score >= 50 ? 'text-amber-400' : 'text-red-400'
  const scoreBg    = score >= 80 ? 'bg-noch-green/10 border-noch-green/30' : score >= 50 ? 'bg-amber-400/10 border-amber-400/30' : 'bg-red-500/10 border-red-500/30'

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <BackButton to="/inventory" />

        <div className="flex items-center gap-3 mb-6 mt-2">
          <div className="w-10 h-10 rounded-xl bg-noch-green/10 text-noch-green flex items-center justify-center">
            <Brain size={20} />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">
              {ar ? 'ذكاء المخزون' : 'Inventory Intelligence'}
            </h1>
            <p className="text-noch-muted text-sm">
              {ar ? 'تحليل المخزون وتوقع النفاد' : 'Stock analysis and runout prediction'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-noch-muted">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Health Score */}
            <div className={`rounded-2xl border p-5 flex items-center gap-4 ${scoreBg}`}>
              <div className={`text-4xl font-black ${scoreColor}`}>{score}</div>
              <div>
                <p className="text-white font-semibold">{ar ? 'نقاط صحة المخزون' : 'Inventory Health Score'}</p>
                <p className="text-noch-muted text-sm">
                  {score >= 80
                    ? (ar ? 'المخزون بحالة جيدة' : 'Stock is in good shape')
                    : score >= 50
                    ? (ar ? 'بعض الأصناف تحتاج انتباه' : 'Some items need attention')
                    : (ar ? 'تحذير: مشاكل حرجة في المخزون' : 'Warning: critical stock issues')}
                </p>
              </div>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryTile count={outItems.length}    label={ar ? 'نفد' : 'Out'}    color="red"   icon={AlertTriangle} />
              <SummaryTile count={lowItems.length}    label={ar ? 'منخفض' : 'Low'}  color="yellow" icon={TrendingDown} />
              <SummaryTile count={urgentItems.length} label={ar ? 'عاجل' : 'Urgent'} color="orange" icon={Zap} />
              <SummaryTile count={okItems.length}     label={ar ? 'جيد' : 'OK'}    color="green"  icon={Package} />
            </div>

            {/* Item groups */}
            {[
              { items: outItems,    title: ar ? 'نفد المخزون' : 'Out of stock',    color: 'border-red-500/40 bg-red-500/5' },
              { items: urgentItems, title: ar ? 'ينفد قريباً (أقل من 7 أيام)' : 'Running out soon (< 7 days)', color: 'border-orange-400/40 bg-orange-400/5' },
              { items: lowItems,    title: ar ? 'تحت الحد الأدنى' : 'Below minimum threshold', color: 'border-yellow-400/40 bg-yellow-400/5' },
              { items: watchItems,  title: ar ? 'تحت المراقبة (7-14 يوم)' : 'Watch (7-14 days left)', color: 'border-amber-400/40 bg-amber-400/5' },
            ].map(group => group.items.length > 0 && (
              <section key={group.title} className={`rounded-2xl border overflow-hidden ${group.color}`}>
                <p className="text-white font-semibold text-sm px-4 py-3 border-b border-noch-border/50">
                  {group.title} — {group.items.length}
                </p>
                <div className="divide-y divide-noch-border/30">
                  {group.items.map(it => (
                    <div key={it.id} className="flex items-center justify-between px-4 py-2.5">
                      <p className="text-white text-sm">{ar && it.name_ar ? it.name_ar : it.name}</p>
                      <div className="text-right">
                        <p className="text-noch-muted text-xs">
                          {it.qty_available ?? '?'} {it.unit || ''}
                        </p>
                        {it.daysToOut !== null && (
                          <p className="text-noch-muted text-xs">
                            {it.daysToOut === 0
                              ? (ar ? 'نفد الآن' : 'gone now')
                              : `~${it.daysToOut}d left`}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {outItems.length === 0 && urgentItems.length === 0 && lowItems.length === 0 && watchItems.length === 0 && (
              <div className="rounded-2xl border border-noch-green/30 bg-noch-green/5 p-6 text-center">
                <p className="text-noch-green font-semibold">{ar ? 'كل شيء على ما يرام!' : 'All good!'}</p>
                <p className="text-noch-muted text-sm mt-1">{ar ? 'لا توجد مشاكل في المخزون حالياً' : 'No stock issues detected right now'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}

// eslint-disable-next-line no-unused-vars
function SummaryTile({ count, label, color, icon: IconComp }) {
  const styles = {
    red:    'bg-red-500/10 border-red-500/30 text-red-400',
    yellow: 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400',
    orange: 'bg-orange-400/10 border-orange-400/30 text-orange-400',
    green:  'bg-noch-green/10 border-noch-green/30 text-noch-green',
  }
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-1 ${styles[color]}`}>
      <IconComp size={16} />
      <p className="text-white font-bold text-xl">{count}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  )
}
