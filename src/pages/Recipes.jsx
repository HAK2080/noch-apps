import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Search, RefreshCw, Archive, ChevronDown, ArrowUpDown } from 'lucide-react'
import { getRecipes, createRecipe, updateRecipe, archiveRecipe } from '../lib/supabase'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import RecipeCard from '../components/recipes/RecipeCard'
import RecipeForm from '../components/recipes/RecipeForm'
import EmptyState from '../components/shared/EmptyState'
import toast from 'react-hot-toast'

/* ── category meta ── */
const CATEGORIES = [
  { value: 'all',       label_en: 'All',       label_ar: 'الكل' },
  { value: 'matcha',    label_en: 'Matcha',    label_ar: 'ماتشا' },
  { value: 'signature', label_en: 'Signature', label_ar: 'سيغنتشر' },
  { value: 'coffee',    label_en: 'Coffee',    label_ar: 'قهوة' },
  { value: 'specialty', label_en: 'Specialty', label_ar: 'مميزة' },
]

const SERVE_FILTERS = [
  { value: 'all',  label_en: 'All',  label_ar: 'الكل' },
  { value: 'iced', label_en: 'Cold', label_ar: 'بارد' },
  { value: 'hot',  label_en: 'Hot',  label_ar: 'ساخن' },
]

const SORT_OPTIONS = [
  { value: 'code_asc',   label_en: 'Code A→Z',     label_ar: 'الكود أ→ي' },
  { value: 'code_desc',  label_en: 'Code Z→A',     label_ar: 'الكود ي→أ' },
  { value: 'name_asc',   label_en: 'Name A→Z',     label_ar: 'الاسم أ→ي' },
  { value: 'name_desc',  label_en: 'Name Z→A',     label_ar: 'الاسم ي→أ' },
  { value: 'newest',     label_en: 'Newest First',  label_ar: 'الأحدث أولاً' },
  { value: 'oldest',     label_en: 'Oldest First',  label_ar: 'الأقدم أولاً' },
]

/* ── tiny pill button ── */
function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
        active
          ? 'bg-noch-green text-noch-dark'
          : 'border border-noch-border text-noch-muted hover:border-noch-green/40 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

/* ── dropdown ── */
function Dropdown({ label, icon: Icon, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-noch-border text-noch-muted hover:border-noch-green/40 hover:text-white transition-colors text-xs font-medium whitespace-nowrap"
      >
        {Icon && <Icon size={13} />}
        <span>{selected?.label_en || label}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-noch-card border border-noch-border rounded-lg shadow-xl min-w-36 py-1 overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                value === opt.value
                  ? 'text-noch-green bg-noch-green/10'
                  : 'text-noch-muted hover:text-white hover:bg-white/5'
              }`}
            >
              {opt.label_en}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Recipes() {
  const { t, lang } = useLanguage()
  const { isOwner } = useAuth()
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(null)

  /* ── filter / sort state ── */
  const [search, setSearch]       = useState('')
  const [status, setStatus]       = useState('active')   // active | archived
  const [category, setCategory]   = useState('all')
  const [serve, setServe]         = useState('all')
  const [sort, setSort]           = useState('code_asc')

  /* ── category nav refs (for scroll-to) ── */
  const categoryRefs = useRef({})

  const load = useCallback(async () => {
    setLoading(true)
    try { setRecipes(await getRecipes()) }
    catch { toast.error(t('error')) }
    finally { setLoading(false) }
  }, [t])

  useEffect(() => { load() }, [load])

  /* ── filter + sort ── */
  const filtered = recipes
    .filter(r => {
      if (status === 'archived' ? !r.is_archived : r.is_archived) return false
      if (category !== 'all' && r.category !== category) return false
      if (serve !== 'all' && r.serve_temp !== serve) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !r.code?.toLowerCase().includes(q) &&
          !r.name?.toLowerCase().includes(q) &&
          !r.name_ar?.toLowerCase().includes(q) &&
          !r.category?.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
    .sort((a, b) => {
      switch (sort) {
        case 'code_asc':  return (a.code || '').localeCompare(b.code || '')
        case 'code_desc': return (b.code || '').localeCompare(a.code || '')
        case 'name_asc':  return (a.name || '').localeCompare(b.name || '')
        case 'name_desc': return (b.name || '').localeCompare(a.name || '')
        case 'newest':    return new Date(b.created_at) - new Date(a.created_at)
        case 'oldest':    return new Date(a.created_at) - new Date(b.created_at)
        default:          return 0
      }
    })

  /* ── group by category for jump nav ── */
  const grouped = CATEGORIES.slice(1).reduce((acc, cat) => {
    const items = filtered.filter(r => r.category === cat.value)
    if (items.length > 0) acc[cat.value] = items
    return acc
  }, {})
  const showGrouped = category === 'all' && !search

  const scrollTo = (cat) => {
    categoryRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSave = async (payload) => {
    try {
      if (editingRecipe) {
        const { code, created_by, ...updates } = payload
        await updateRecipe(editingRecipe.id, updates)
        toast.success(t('recipeSaved'))
      } else {
        const { created_by, ...createPayload } = payload
        await createRecipe(createPayload)
        toast.success(t('recipeCreated'))
      }
      setShowForm(false)
      setEditingRecipe(null)
      load()
    } catch (err) { toast.error(err.message || t('error')) }
  }

  const handleArchive = async (id) => {
    try { await archiveRecipe(id); toast.success(lang === 'ar' ? 'تم أرشفة الوصفة' : 'Recipe archived'); load() }
    catch { toast.error(t('error')) }
  }

  const openNew  = () => { setEditingRecipe(null); setShowForm(true) }
  const openEdit = (recipe) => { setEditingRecipe(recipe); setShowForm(true) }

  /* ── category counts for jump nav ── */
  const catCounts = CATEGORIES.slice(1).map(cat => ({
    ...cat,
    count: filtered.filter(r => r.category === cat.value).length,
  })).filter(c => c.count > 0)

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold text-white">{t('recipes')}</h1>
          {isOwner && (
            <button onClick={openNew} className="btn-primary flex items-center gap-2">
              <Plus size={18} /> {t('newRecipe')}
            </button>
          )}
        </div>

        {/* ── Search ── */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <input
            type="text"
            placeholder={lang === 'ar' ? 'ابحث...' : 'Search recipes...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9 w-full"
          />
        </div>

        {/* ── Filter bar ── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Status */}
          <Pill active={status === 'active'}   onClick={() => setStatus('active')}>
            {lang === 'ar' ? 'نشط' : 'Active'}
          </Pill>
          {isOwner && (
            <Pill active={status === 'archived'} onClick={() => setStatus('archived')}>
              <span className="flex items-center gap-1"><Archive size={11} />{lang === 'ar' ? 'مؤرشف' : 'Archived'}</span>
            </Pill>
          )}

          <div className="w-px h-4 bg-noch-border mx-1" />

          {/* Category pills */}
          {CATEGORIES.map(cat => (
            <Pill
              key={cat.value}
              active={category === cat.value}
              onClick={() => setCategory(cat.value)}
            >
              {lang === 'ar' ? cat.label_ar : cat.label_en}
            </Pill>
          ))}

          <div className="w-px h-4 bg-noch-border mx-1" />

          {/* Serve temp pills */}
          {SERVE_FILTERS.map(s => (
            <Pill key={s.value} active={serve === s.value} onClick={() => setServe(s.value)}>
              {lang === 'ar' ? s.label_ar : s.label_en}
            </Pill>
          ))}

          {/* Sort dropdown */}
          <Dropdown
            label="Sort"
            icon={ArrowUpDown}
            options={SORT_OPTIONS}
            value={sort}
            onChange={setSort}
          />

          {/* Refresh */}
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg border border-noch-border text-noch-muted hover:border-noch-green/40 transition-colors flex items-center gap-1"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* ── Jump navigation (category quick-links) ── */}
        {showGrouped && catCounts.length > 1 && (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
            <span className="text-noch-muted text-xs whitespace-nowrap">Jump to:</span>
            {catCounts.map(cat => (
              <button
                key={cat.value}
                onClick={() => scrollTo(cat.value)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-noch-card border border-noch-border text-xs text-noch-muted hover:text-white hover:border-noch-green/40 transition-colors whitespace-nowrap"
              >
                <span>{lang === 'ar' ? cat.label_ar : cat.label_en}</span>
                <span className="bg-noch-green/20 text-noch-green rounded-full px-1.5 py-0.5 text-[10px] font-bold">{cat.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Result count ── */}
        {!loading && (
          <p className="text-noch-muted text-xs mb-4">
            {filtered.length} {lang === 'ar' ? 'وصفة' : filtered.length === 1 ? 'recipe' : 'recipes'}
            {search && <span> for "<span className="text-white">{search}</span>"</span>}
          </p>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-noch-muted">{t('loading')}</p>
          </div>
        )}

        {/* ── Grid — grouped by category or flat ── */}
        {!loading && filtered.length > 0 && (
          showGrouped ? (
            /* Grouped view */
            <div className="space-y-10">
              {Object.entries(grouped).map(([cat, items]) => {
                const catMeta = CATEGORIES.find(c => c.value === cat)
                return (
                  <div key={cat} ref={el => categoryRefs.current[cat] = el}>
                    {/* Section header */}
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-white font-bold text-lg">
                        {lang === 'ar' ? catMeta?.label_ar : catMeta?.label_en}
                      </h2>
                      <span className="text-noch-muted text-sm">({items.length})</span>
                      <div className="flex-1 h-px bg-noch-border" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {items.map(recipe => (
                        <RecipeCard key={recipe.id} recipe={recipe} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Flat view (filtered/searched) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(recipe => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          )
        )}

        {/* ── Empty state ── */}
        {!loading && filtered.length === 0 && (
          <EmptyState
            icon="coffee"
            title={lang === 'ar' ? 'لا توجد وصفات' : 'No recipes found'}
            description={
              search
                ? lang === 'ar' ? 'حاول البحث عن شيء آخر' : 'Try a different search'
                : lang === 'ar' ? 'ابدأ بإنشاء وصفة جديدة' : 'Start by creating a new recipe'
            }
            action={isOwner && !search ? { label: t('newRecipe'), onClick: openNew } : undefined}
          />
        )}

        {showForm && (
          <RecipeForm
            recipe={editingRecipe}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingRecipe(null) }}
          />
        )}
      </div>
    </Layout>
  )
}
