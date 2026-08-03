import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, Plus, RefreshCw, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '../../../contexts/LanguageContext'
import { supabase } from '../../../lib/supabase'
import { listBankItems } from '../services/contentBank'
import {
  createPublication,
  getContentMeasurementSummary,
  listPublications,
  savePerformanceSnapshot,
  updatePublication,
} from '../services/measurement'

const localDateTime = value => {
  const date = value ? new Date(value) : new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

const initialPublication = {
  bank_item_id: '',
  campaign_id: '',
  platform: 'instagram',
  objective_type: 'engagement',
  publishing_mode: 'organic',
  status: 'scheduled',
  planned_at: localDateTime(),
  published_at: '',
  post_url: '',
  external_post_id: '',
  product_id: '',
  spend_lyd: '',
  attribution_window_days: 7,
  experiment_reference: '',
}

const initialSnapshot = {
  publication_id: '',
  horizon: '24h',
  reach: '',
  impressions: '',
  views: '',
  likes: '',
  comments: '',
  shares: '',
  saves: '',
  profile_visits: '',
  link_clicks: '',
  associated_orders: '',
  associated_revenue_lyd: '',
  evidence_note: '',
}

const numberOrNull = value => value === '' || value == null ? null : Number(value)

function Metric({ label, value, hint, alert = false }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-orange-300/30 bg-orange-300/5' : 'border-noch-border bg-noch-card'}`}>
      <p className="text-xs text-noch-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? 'text-orange-200' : 'text-white'}`}>{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-noch-muted">{hint}</p>}
    </div>
  )
}

export default function ContentMeasurement() {
  const { businessId, businesses, loading: contextLoading } = useOutletContext()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [summary, setSummary] = useState(null)
  const [publications, setPublications] = useState([])
  const [bankItems, setBankItems] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [products, setProducts] = useState([])
  const [publicationForm, setPublicationForm] = useState(initialPublication)
  const [snapshotForm, setSnapshotForm] = useState(initialSnapshot)
  const [showPublicationForm, setShowPublicationForm] = useState(false)
  const [showSnapshotForm, setShowSnapshotForm] = useState(false)
  const [publishingId, setPublishingId] = useState(null)
  const [publishUrl, setPublishUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    try {
      const [summaryData, publicationRows, approvedItems, campaignResult, productResult] = await Promise.all([
        getContentMeasurementSummary(businessId),
        listPublications(businessId),
        listBankItems({ businessId, status: 'approved' }),
        supabase.from('cs_campaigns').select('id,name').eq('business_id', businessId).order('created_at', { ascending: false }),
        supabase.from('pos_products').select('id,name').eq('is_active', true).order('name'),
      ])
      if (campaignResult.error) throw campaignResult.error
      if (productResult.error) throw productResult.error
      setSummary(summaryData)
      setPublications(publicationRows)
      setBankItems(approvedItems)
      setCampaigns(campaignResult.data || [])
      setProducts(productResult.data || [])
    } catch (error) {
      toast.error(error.message || 'Could not load content measurement')
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => { load() }, [load])

  const savePublication = async event => {
    event.preventDefault()
    if (!publicationForm.bank_item_id) return
    if (publicationForm.status === 'published' && !publicationForm.post_url.trim() && !publicationForm.external_post_id.trim()) {
      toast.error(ar ? 'رابط المنشور أو معرّفه مطلوب' : 'Post URL or external ID is required')
      return
    }
    if (publicationForm.objective_type === 'sales' && !publicationForm.product_id) {
      toast.error(ar ? 'اربط منتجاً بهدف المبيعات' : 'Sales content must map to a product')
      return
    }
    const item = bankItems.find(row => row.id === publicationForm.bank_item_id)
    setSaving(true)
    try {
      await createPublication({
        business_id: businessId,
        bank_item_id: publicationForm.bank_item_id,
        campaign_id: publicationForm.campaign_id || null,
        platform: publicationForm.platform,
        format: item?.format || null,
        objective_type: publicationForm.objective_type,
        publishing_mode: publicationForm.publishing_mode,
        status: publicationForm.status,
        planned_at: publicationForm.planned_at ? new Date(publicationForm.planned_at).toISOString() : null,
        published_at: publicationForm.status === 'published'
          ? new Date(publicationForm.published_at || publicationForm.planned_at || Date.now()).toISOString()
          : null,
        post_url: publicationForm.post_url.trim() || null,
        external_post_id: publicationForm.external_post_id.trim() || null,
        product_ids: publicationForm.product_id ? [publicationForm.product_id] : [],
        spend_lyd: numberOrNull(publicationForm.spend_lyd),
        attribution_window_days: Number(publicationForm.attribution_window_days),
        experiment_reference: publicationForm.experiment_reference.trim() || null,
        idempotency_key: crypto.randomUUID(),
      })
      toast.success(ar ? 'تم حفظ خطة النشر' : 'Publication plan saved')
      setPublicationForm({ ...initialPublication, planned_at: localDateTime() })
      setShowPublicationForm(false)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not save publication')
    } finally {
      setSaving(false)
    }
  }

  const markPublished = async publication => {
    if (!publishUrl.trim()) {
      toast.error(ar ? 'رابط المنشور مطلوب' : 'Post URL is required')
      return
    }
    setSaving(true)
    try {
      await updatePublication(publication.id, {
        status: 'published',
        published_at: new Date().toISOString(),
        post_url: publishUrl.trim(),
      })
      toast.success(ar ? 'تم تأكيد النشر' : 'Publication marked as published')
      setPublishingId(null)
      setPublishUrl('')
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not update publication')
    } finally {
      setSaving(false)
    }
  }

  const saveSnapshot = async event => {
    event.preventDefault()
    if (!snapshotForm.publication_id) return
    setSaving(true)
    try {
      await savePerformanceSnapshot({
        publication_id: snapshotForm.publication_id,
        horizon: snapshotForm.horizon,
        observed_at: new Date().toISOString(),
        reach: numberOrNull(snapshotForm.reach),
        impressions: numberOrNull(snapshotForm.impressions),
        views: numberOrNull(snapshotForm.views),
        likes: numberOrNull(snapshotForm.likes),
        comments: numberOrNull(snapshotForm.comments),
        shares: numberOrNull(snapshotForm.shares),
        saves: numberOrNull(snapshotForm.saves),
        profile_visits: numberOrNull(snapshotForm.profile_visits),
        link_clicks: numberOrNull(snapshotForm.link_clicks),
        associated_orders: numberOrNull(snapshotForm.associated_orders),
        associated_revenue_lyd: numberOrNull(snapshotForm.associated_revenue_lyd),
        source: 'manual',
        evidence_note: snapshotForm.evidence_note.trim() || null,
      })
      toast.success(ar ? 'تم حفظ لقطة الأداء' : 'Performance snapshot saved')
      setSnapshotForm(initialSnapshot)
      setShowSnapshotForm(false)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not save snapshot')
    } finally {
      setSaving(false)
    }
  }

  if (contextLoading || loading) return <div className="flex justify-center py-16 text-noch-muted"><Loader2 className="animate-spin" /></div>
  if (!businesses?.length || !businessId) return <p className="text-noch-muted">{ar ? 'اختر نشاطاً أولاً.' : 'Choose a business first.'}</p>

  const pipeline = summary?.pipeline || {}
  const evidence = summary?.evidence || {}
  const operations = summary?.operations || {}

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><BarChart3 size={19} className="text-noch-green" /><h2 className="text-xl font-semibold text-white">{ar ? 'النشر وقياس المحتوى' : 'Publishing & content measurement'}</h2></div>
          <p className="mt-1 text-sm text-noch-muted">{ar ? 'مسار واحد من المحتوى المعتمد إلى النشر والدليل والنتيجة.' : 'One path from approved asset to publication, evidence, and learning.'}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary p-2.5" onClick={load}><RefreshCw size={16} /></button>
          <button className="btn-secondary" onClick={() => setShowSnapshotForm(value => !value)}><Save size={15} className="me-2 inline" />{ar ? 'لقطة أداء' : 'Performance snapshot'}</button>
          <button className="btn-primary" onClick={() => setShowPublicationForm(value => !value)}><Plus size={15} className="me-2 inline" />{ar ? 'خطة نشر' : 'Publication plan'}</button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label={ar ? 'معتمد' : 'Approved'} value={pipeline.approved_assets || 0} />
        <Metric label={ar ? 'مجدول' : 'Scheduled'} value={pipeline.scheduled || 0} />
        <Metric label={ar ? 'منشور' : 'Published'} value={pipeline.published || 0} />
        <Metric label={ar ? 'استخدام المعتمد' : 'Approved-use rate'} value={summary?.approved_use?.rate_pct == null ? '—' : `${summary.approved_use.rate_pct}%`} hint={ar ? 'الهدف 80%' : 'target 80%'} />
        <Metric label={ar ? 'اكتمال الدليل' : 'Evidence complete'} value={evidence.completeness_pct == null ? '—' : `${evidence.completeness_pct}%`} hint={ar ? 'الهدف 90%' : 'target 90%'} alert={Number(evidence.missing) > 0} />
      </div>

      {(Number(operations.overdue_scheduled) > 0 || Number(evidence.missing) > 0) && (
        <div className="rounded-xl border border-orange-300/30 bg-orange-300/5 p-4 text-sm text-orange-100">
          <AlertTriangle size={17} className="me-2 inline" />
          {ar
            ? `${operations.overdue_scheduled || 0} منشور متأخر و${evidence.missing || 0} منشور بدليل ناقص.`
            : `${operations.overdue_scheduled || 0} overdue publication(s) and ${evidence.missing || 0} published item(s) with incomplete evidence.`}
        </div>
      )}

      <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm text-cyan-100">
        {ar ? 'طلبات ومبيعات ما بعد المنشور ارتباط رصدي فقط. لا نستخدم كلمة “زيادة” أو “تأثير” إلا مع تجربة وضابط مسجل.' : 'Post-publication orders and revenue are observational associations. The system does not claim lift or causality without a recorded experiment and control.'}
      </div>

      {showPublicationForm && (
        <form className="card space-y-3" onSubmit={savePublication}>
          <h3 className="font-semibold text-white">{ar ? 'خطة نشر جديدة' : 'New publication plan'}</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Field label={ar ? 'المحتوى المعتمد' : 'Approved asset'} wide>
              <select className="input w-full" value={publicationForm.bank_item_id} onChange={event => setPublicationForm({ ...publicationForm, bank_item_id: event.target.value })} required>
                <option value="">{ar ? 'اختر…' : 'Choose…'}</option>
                {bankItems.map(item => <option key={item.id} value={item.id}>{item.final_text?.slice(0, 90)}</option>)}
              </select>
            </Field>
            <Field label={ar ? 'المنصة' : 'Platform'}><select className="input w-full" value={publicationForm.platform} onChange={event => setPublicationForm({ ...publicationForm, platform: event.target.value })}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="facebook">Facebook</option><option value="google_business">Google Business</option></select></Field>
            <Field label={ar ? 'الهدف' : 'Objective'}><select className="input w-full" value={publicationForm.objective_type} onChange={event => setPublicationForm({ ...publicationForm, objective_type: event.target.value })}>{['awareness','engagement','traffic','sales','retention','ugc'].map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label={ar ? 'الحالة' : 'Status'}><select className="input w-full" value={publicationForm.status} onChange={event => setPublicationForm({ ...publicationForm, status: event.target.value })}><option value="scheduled">{ar ? 'مجدول' : 'Scheduled'}</option><option value="published">{ar ? 'منشور' : 'Published'}</option></select></Field>
            <Field label={ar ? 'موعد النشر' : 'Planned time'}><input type="datetime-local" className="input w-full" value={publicationForm.planned_at} onChange={event => setPublicationForm({ ...publicationForm, planned_at: event.target.value })} /></Field>
            <Field label={ar ? 'الحملة' : 'Campaign'}><select className="input w-full" value={publicationForm.campaign_id} onChange={event => setPublicationForm({ ...publicationForm, campaign_id: event.target.value })}><option value="">{ar ? 'بدون' : 'None'}</option>{campaigns.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
            <Field label={ar ? 'المنتج' : 'Product'}><select className="input w-full" value={publicationForm.product_id} onChange={event => setPublicationForm({ ...publicationForm, product_id: event.target.value })}><option value="">{ar ? 'بدون' : 'None'}</option>{products.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
            <Field label={ar ? 'الرابط' : 'Post URL'} wide><input className="input w-full" value={publicationForm.post_url} onChange={event => setPublicationForm({ ...publicationForm, post_url: event.target.value })} /></Field>
            <Field label={ar ? 'تكلفة الدفع LYD' : 'Paid spend LYD'}><input type="number" min="0" step="0.001" className="input w-full" value={publicationForm.spend_lyd} onChange={event => setPublicationForm({ ...publicationForm, spend_lyd: event.target.value, publishing_mode: event.target.value ? 'paid' : 'organic' })} /></Field>
            <Field label={ar ? 'مرجع التجربة' : 'Experiment reference'}><input className="input w-full" value={publicationForm.experiment_reference} onChange={event => setPublicationForm({ ...publicationForm, experiment_reference: event.target.value })} /></Field>
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : (ar ? 'حفظ' : 'Save')}</button>
        </form>
      )}

      {showSnapshotForm && (
        <form className="card space-y-3" onSubmit={saveSnapshot}>
          <h3 className="font-semibold text-white">{ar ? 'لقطة أداء قابلة للمقارنة' : 'Comparable performance snapshot'}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label={ar ? 'المنشور' : 'Publication'} wide><select className="input w-full" value={snapshotForm.publication_id} onChange={event => setSnapshotForm({ ...snapshotForm, publication_id: event.target.value })} required><option value="">{ar ? 'اختر…' : 'Choose…'}</option>{publications.filter(row => row.status === 'published').map(row => <option key={row.id} value={row.id}>{row.platform} · {row.bank_item?.final_text?.slice(0, 70)}</option>)}</select></Field>
            <Field label={ar ? 'الأفق' : 'Horizon'}><select className="input w-full" value={snapshotForm.horizon} onChange={event => setSnapshotForm({ ...snapshotForm, horizon: event.target.value })}><option value="24h">24h</option><option value="7d">7d</option><option value="final">Final</option></select></Field>
            {['reach','impressions','views','likes','comments','shares','saves','profile_visits','link_clicks','associated_orders','associated_revenue_lyd'].map(key => <Field key={key} label={key.replaceAll('_', ' ')}><input type="number" min="0" step={key.endsWith('_lyd') ? '0.001' : '1'} className="input w-full" value={snapshotForm[key]} onChange={event => setSnapshotForm({ ...snapshotForm, [key]: event.target.value })} /></Field>)}
          </div>
          <Field label={ar ? 'ملاحظة الدليل' : 'Evidence note'}><input className="input w-full" value={snapshotForm.evidence_note} onChange={event => setSnapshotForm({ ...snapshotForm, evidence_note: event.target.value })} /></Field>
          <button className="btn-primary" disabled={saving}>{ar ? 'حفظ اللقطة' : 'Save snapshot'}</button>
        </form>
      )}

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="text-xs text-noch-muted"><tr><th className="py-2 text-start">{ar ? 'المحتوى' : 'Content'}</th><th className="text-start">{ar ? 'المنصة' : 'Platform'}</th><th className="text-start">{ar ? 'الحالة' : 'Status'}</th><th className="text-start">{ar ? 'الهدف' : 'Objective'}</th><th className="text-end">24h</th><th className="text-end">7d</th><th className="text-start">{ar ? 'الدليل' : 'Evidence'}</th><th className="text-start">{ar ? 'الإجراء' : 'Action'}</th></tr></thead>
          <tbody>
            {publications.map(row => {
              const horizons = new Set((row.snapshots || []).map(snapshot => snapshot.horizon))
              const complete = row.status !== 'published' || (horizons.has('24h') && horizons.has('7d'))
              return (
                <tr key={row.id} className="border-t border-noch-border">
                  <td className="max-w-sm py-3 text-white"><p className="line-clamp-2">{row.bank_item?.final_text}</p><p className="text-xs text-noch-muted">{row.planned_at ? new Date(row.planned_at).toLocaleString(ar ? 'ar-LY' : 'en-GB') : '—'}</p></td>
                  <td className="text-noch-muted">{row.platform}</td>
                  <td className="text-white">{row.status}</td>
                  <td className="text-white">{row.objective_type}</td>
                  <td className="text-end">{horizons.has('24h') ? <CheckCircle2 size={15} className="ms-auto text-noch-green" /> : '—'}</td>
                  <td className="text-end">{horizons.has('7d') ? <CheckCircle2 size={15} className="ms-auto text-noch-green" /> : '—'}</td>
                  <td className={complete ? 'text-noch-green' : 'text-orange-200'}>{complete ? (ar ? 'مكتمل' : 'Complete') : (ar ? 'ناقص' : 'Incomplete')}</td>
                  <td className="min-w-[210px] py-2">
                    {row.status === 'scheduled' && publishingId !== row.id && (
                      <button type="button" className="btn-secondary text-xs" onClick={() => setPublishingId(row.id)}>
                        {ar ? 'تأكيد النشر' : 'Mark published'}
                      </button>
                    )}
                    {row.status === 'scheduled' && publishingId === row.id && (
                      <div className="flex gap-2">
                        <input
                          className="input min-w-0 flex-1 text-xs"
                          placeholder={ar ? 'رابط المنشور' : 'Post URL'}
                          value={publishUrl}
                          onChange={event => setPublishUrl(event.target.value)}
                        />
                        <button type="button" className="btn-primary text-xs" disabled={saving} onClick={() => markPublished(row)}>
                          {ar ? 'حفظ' : 'Save'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Field({ label, children, wide = false }) {
  return <label className={wide ? 'col-span-2' : ''}><span className="mb-1 block text-xs text-noch-muted">{label}</span>{children}</label>
}
