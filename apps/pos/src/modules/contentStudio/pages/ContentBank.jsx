import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Archive, BarChart3, Copy, Library, Loader2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '../../../contexts/LanguageContext'
import EmptyState from '../components/EmptyState'
import { archiveBankItem, listBankItems } from '../services/contentBank'
import { FORMATS, PLATFORMS } from '../lib/constants'

export default function ContentBank() {
  const { businessId, businesses, loading: contextLoading } = useOutletContext()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [platform, setPlatform] = useState('')
  const [format, setFormat] = useState('')
  const [pillar, setPillar] = useState('')
  const [status, setStatus] = useState('approved')
  const [search, setSearch] = useState('')

  const refresh = useCallback(async () => {
    if (!businessId) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      setItems(await listBankItems({
        businessId,
        platform: platform || undefined,
        format: format || undefined,
        status: status || undefined,
        search: search.trim() || undefined,
      }))
    } catch (error) {
      toast.error(error.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [businessId, format, platform, search, status])

  useEffect(() => { refresh() }, [refresh])

  const pillarOptions = useMemo(
    () => Array.from(new Set(items.map(item => item.content_pillar).filter(Boolean))),
    [items],
  )
  const filtered = pillar
    ? items.filter(item => item.content_pillar === pillar)
    : items

  const handleArchive = async id => {
    try {
      await archiveBankItem(id)
      setItems(current => current.filter(item => item.id !== id))
      toast.success(ar ? 'تمت الأرشفة' : 'Archived')
    } catch (error) {
      toast.error(error.message || 'Failed')
    }
  }

  const copy = text => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(ar ? 'تم النسخ' : 'Copied'),
      () => toast.error(ar ? 'تعذر النسخ' : 'Copy failed'),
    )
  }

  if (contextLoading) return null
  if (!businesses?.length) return <EmptyState icon={Library} title="Create a business first" ctaLabel="Add a business" ctaTo="/content-studio/businesses/new" />
  if (!businessId) return <EmptyState icon={Library} title="Pick a business" />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-noch-border bg-noch-card px-2 py-1">
          <Search size={14} className="text-noch-muted" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder={ar ? 'بحث…' : 'Search text…'} className="w-40 bg-transparent text-sm text-white focus:outline-none" />
        </div>
        <select value={platform} onChange={event => setPlatform(event.target.value)} className={selectClass}>
          <option value="">{ar ? 'كل المنصات' : 'All platforms'}</option>
          {PLATFORMS.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
        <select value={format} onChange={event => setFormat(event.target.value)} className={selectClass}>
          <option value="">{ar ? 'كل الصيغ' : 'All formats'}</option>
          {FORMATS.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
        {pillarOptions.length > 0 && (
          <select value={pillar} onChange={event => setPillar(event.target.value)} className={selectClass}>
            <option value="">{ar ? 'كل المحاور' : 'All pillars'}</option>
            {pillarOptions.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        )}
        <select value={status} onChange={event => setStatus(event.target.value)} className={selectClass}>
          <option value="approved">{ar ? 'معتمد' : 'Approved'}</option>
          <option value="archived">{ar ? 'مؤرشف' : 'Archived'}</option>
          <option value="">{ar ? 'الكل' : 'All'}</option>
        </select>
        <Link to="/content-studio/performance" className="btn-secondary ms-auto flex items-center gap-2 text-sm">
          <BarChart3 size={15} />{ar ? 'تخطيط النشر والقياس' : 'Plan publishing & measurement'}
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-noch-muted"><Loader2 size={20} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Library} title={ar ? 'بنك المحتوى فارغ' : 'Content Bank is empty'} description={ar ? 'اعتمد مسودة لإضافتها هنا.' : 'Approve drafts from the workbench to snapshot them here for reuse.'} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map(item => (
            <article key={item.id} className="rounded-2xl border border-noch-border bg-noch-card p-4">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="text-noch-muted">
                  {item.format?.replace('_', ' ')}{item.platform && ` · ${item.platform}`}{item.content_pillar && ` · ${item.content_pillar}`}
                </span>
                <span className="rounded-full bg-noch-border px-2 py-0.5 capitalize text-noch-muted">{item.status}</span>
              </div>
              <p className="mb-2 whitespace-pre-wrap text-sm text-white">{item.final_text}</p>
              {item.hashtags?.length > 0 && <p className="mb-2 text-xs text-noch-green/80">{item.hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ')}</p>}
              <div className="flex items-center justify-between text-[11px] text-noch-muted">
                <span>{item.voice?.name || 'no voice'} · {formatDate(item.approved_at)}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => copy(item.final_text)} className="flex items-center gap-1 hover:text-white"><Copy size={12} />{ar ? 'نسخ' : 'Copy'}</button>
                  {item.status !== 'archived' && <button onClick={() => handleArchive(item.id)} className="flex items-center gap-1 hover:text-red-400"><Archive size={12} />{ar ? 'أرشفة' : 'Archive'}</button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

const selectClass = 'rounded-lg border border-noch-border bg-noch-card px-2 py-1.5 text-sm text-white'
const formatDate = value => {
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return ''
  }
}
