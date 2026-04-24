// ContentStudio.jsx — Content hub (Screen 1)
// 3 tiles max. Brand header. Content gap analysis.
// Clean, no friction.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Eye, Settings, Plus, BarChart3, AlertTriangle, RefreshCw, Lightbulb, List } from 'lucide-react'
import { getBrands, createBrand, updateBrand, createBrandMaterial, createResearch, createContentPost, getContentPosts, getContentIdeas, getContentSeries, createContentSeries } from '../../lib/supabase'
import { NOCH_SEED, buildBrandProgram } from '../../lib/contentEngine'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import Layout from '../../components/Layout'
import { runImprovementLoop } from '../../lib/claudeClient'
import toast from 'react-hot-toast'

// ── Action tile ─────────────────────────────────────────────
function ActionTile({ emoji, title, desc, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      className={`group rounded-xl p-5 text-left transition-all hover:shadow-lg w-full active:scale-95 ${
        primary
          ? 'bg-noch-green/10 border border-noch-green/30 hover:bg-noch-green/20 hover:border-noch-green/60'
          : 'bg-noch-card border border-noch-border hover:border-noch-green/30'
      }`}
    >
      <div className="text-2xl mb-3">{emoji}</div>
      <h3 className={`font-bold text-base mb-1 ${primary ? 'text-noch-green' : 'text-white'}`}>{title}</h3>
      <p className="text-noch-muted text-xs leading-relaxed">{desc}</p>
    </button>
  )
}

// ── Stat mini card ───────────────────────────────────────────
function Stat({ label, value }) {
  return (
    <div className="bg-noch-card border border-noch-border rounded-xl p-4 text-center">
      <p className="text-white font-bold text-xl">{value ?? '—'}</p>
      <p className="text-noch-muted text-xs mt-0.5">{label}</p>
    </div>
  )
}

// ── Content Gap mini card ─────────────────────────────────────
const CATEGORIES = [
  { key: 'product_showcase', label: 'Product', color: 'bg-emerald-400' },
  { key: 'humor_meme', label: 'Humor', color: 'bg-yellow-400' },
  { key: 'behind_scenes', label: 'BTS', color: 'bg-blue-400' },
  { key: 'cultural_moment', label: 'Cultural', color: 'bg-purple-400' },
  { key: 'promotion', label: 'Promo', color: 'bg-orange-400' },
  { key: 'educational', label: 'Educational', color: 'bg-cyan-400' },
]

function GapCard({ brandId, navigate }) {
  const [loading, setLoading] = useState(true)
  const [mix, setMix] = useState({})
  const [gap, setGap] = useState(null)

  useEffect(() => {
    if (!brandId) return
    getContentPosts(brandId).then(posts => {
      const recent = posts.filter(p => new Date(p.created_at) > new Date(Date.now() - 30 * 86400000))
      const counts = {}
      CATEGORIES.forEach(c => { counts[c.key] = 0 })
      recent.forEach(p => {
        const text = (p.caption_ar || p.caption_en || '').toLowerCase()
        if (text.includes('funny') || text.includes('مضحك')) counts.humor_meme++
        else if (text.includes('offer') || text.includes('عرض')) counts.promotion++
        else if (text.includes('behind') || text.includes('وراء')) counts.behind_scenes++
        else counts.product_showcase++
      })
      const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
      const pct = {}
      CATEGORIES.forEach(c => { pct[c.key] = Math.round(counts[c.key] / total * 100) })
      setMix(pct)
      const underused = CATEGORIES.filter(c => pct[c.key] === 0).map(c => c.label)
      if (underused.length) setGap(underused[0])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [brandId])

  if (loading) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-noch-green" />
          <span className="text-white font-semibold text-sm">Content Mix</span>
        </div>
        <span className="text-noch-muted text-xs">Last 30 days</span>
      </div>

      <div className="flex items-end gap-1.5 h-12 mb-3">
        {CATEGORIES.map(c => (
          <div key={c.key} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full rounded-sm ${c.color} transition-all`}
              style={{ height: `${Math.max(4, (mix[c.key] || 0) * 0.48)}px` }}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        {CATEGORIES.map(c => (
          <div key={c.key} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-sm ${c.color}`} />
            <span className="text-noch-muted text-[10px]">{c.label}</span>
          </div>
        ))}
      </div>

      {gap && (
        <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={12} className="text-yellow-400 shrink-0" />
          <p className="text-yellow-400 text-xs">
            Try a <strong>{gap}</strong> post — you haven't posted one recently.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Today's suggested pillar (rotates by day of week) ────────
const DAY_PILLARS = [
  { id: 'joyful_nihilism', label: "Joyful Nihilism", emoji: '🌀' },   // Sunday
  { id: 'notchis_world', label: "Notchi's World", emoji: '🐰' },       // Monday
  { id: 'the_drop', label: "The Drop", emoji: '🪂' },                  // Tuesday
  { id: 'craft_moment', label: "The Craft", emoji: '⚗️' },             // Wednesday
  { id: 'real_moment', label: "Real Moments", emoji: '📸' },           // Thursday
  { id: 'reactive', label: "Reactive", emoji: '⚡' },                  // Friday
  { id: 'joyful_nihilism', label: "Joyful Nihilism", emoji: '🌀' },   // Saturday
]

function TodayBrief({ brandId, candidateCount, navigate, ar }) {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const pillar = DAY_PILLARS[dayOfWeek]
  const dayName = today.toLocaleDateString(ar ? 'ar-LY' : 'en-GB', { weekday: 'long' })
  const dateStr = today.toLocaleDateString(ar ? 'ar-LY' : 'en-GB', { day: 'numeric', month: 'long' })

  return (
    <div className="card mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-noch-muted text-xs">{ar ? 'اليوم' : 'Today'}</p>
          <p className="text-white font-bold">{dayName}, {dateStr}</p>
        </div>
      </div>

      {/* Suggested pillar */}
      <div className="flex items-center gap-3 bg-noch-green/5 border border-noch-green/20 rounded-xl px-4 py-3 mb-3">
        <span className="text-2xl">{pillar.emoji}</span>
        <div className="flex-1">
          <p className="text-noch-muted text-xs mb-0.5">{ar ? 'المقترح لليوم' : "Today's Pillar"}</p>
          <p className="text-white font-semibold text-sm">{pillar.label}</p>
        </div>
        {brandId && (
          <button
            onClick={() => navigate(`/content/studio?brand=${brandId}&intent=${pillar.id}`)}
            className="btn-primary text-xs px-3 py-1.5"
          >
            <Zap size={12} className="inline mr-1" />
            {ar ? 'أنشئ' : 'Create'}
          </button>
        )}
      </div>

      {/* Candidate ideas banner */}
      {candidateCount > 0 && (
        <button
          onClick={() => navigate(`/content/ideas?brand=${brandId}`)}
          className="w-full text-left flex items-center gap-2 text-blue-400 text-sm hover:text-blue-300 transition-colors"
        >
          <Lightbulb size={14} />
          {candidateCount} {ar ? 'أفكار جاهزة للتطوير' : `ideas ready to develop`}
          <span className="ml-auto">→</span>
        </button>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════
export default function ContentStudio() {
  const navigate = useNavigate()
  const { isOwner } = useAuth()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [improving, setImproving] = useState(false)
  const [activeBrand, setActiveBrand] = useState(null)
  const [seriesList, setSeriesList] = useState([])
  const [candidateCount, setCandidateCount] = useState(0)
  const [showNewSeries, setShowNewSeries] = useState(false)
  const [newSeriesForm, setNewSeriesForm] = useState({ name: '', pillar: '', cadence: 'weekly', template_hint: '' })
  const [savingSeries, setSavingSeries] = useState(false)

  useEffect(() => { loadBrands() }, [])

  async function loadBrands() {
    try {
      const data = await getBrands()
      setBrands(data)
      if (data.length > 0) {
        setActiveBrand(data[0])
        loadBrandExtras(data[0].id)
      }
    } catch {
      toast.error('Failed to load brands')
    } finally {
      setLoading(false)
    }
  }

  async function loadBrandExtras(brandId) {
    try {
      const [series, ideas] = await Promise.all([
        getContentSeries(brandId).catch(() => []),
        getContentIdeas(brandId, { status: 'candidate' }).catch(() => []),
      ])
      setSeriesList(series.filter(s => s.is_active))
      setCandidateCount(ideas.length)
    } catch { /* non-critical */ }
  }

  async function handleCreateSeries() {
    if (!activeBrand || !newSeriesForm.name || !newSeriesForm.pillar) {
      toast.error('Name and pillar required')
      return
    }
    setSavingSeries(true)
    try {
      await createContentSeries({ ...newSeriesForm, brand_id: activeBrand.id })
      toast.success('Series created')
      setShowNewSeries(false)
      setNewSeriesForm({ name: '', pillar: '', cadence: 'weekly', template_hint: '' })
      loadBrandExtras(activeBrand.id)
    } catch (err) {
      toast.error(err.message || 'Failed to create series')
    } finally {
      setSavingSeries(false)
    }
  }

  async function seedNoch() {
    if (!isOwner) return
    setSeeding(true)
    try {
      const brand = await createBrand(NOCH_SEED.brand)
      const program = buildBrandProgram(brand, NOCH_SEED.materials)
      await updateBrand(brand.id, { brand_program: program })
      for (const mat of NOCH_SEED.materials) await createBrandMaterial({ brand_id: brand.id, ...mat })
      for (const r of NOCH_SEED.research) await createResearch({ brand_id: brand.id, ...r })
      for (const p of NOCH_SEED.posts) await createContentPost({ brand_id: brand.id, ...p })
      toast.success('Noch brand seeded!')
      await loadBrands()
    } catch (e) {
      toast.error('Seed failed: ' + (e.message || 'unknown'))
    } finally {
      setSeeding(false)
    }
  }

  async function handleImproveLoop() {
    if (!activeBrand) return
    setImproving(true)
    try {
      await runImprovementLoop(activeBrand.id)
      toast.success(ar ? 'تم تحسين برنامج العلامة التجارية ✓' : 'Brand program improved ✓')
    } catch (e) {
      toast.error(e.message || (ar ? 'خطأ في التحسين' : 'Improvement loop failed'))
    } finally {
      setImproving(false)
    }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">...</p></Layout>

  const noBrands = brands.length === 0

  return (
    <Layout>
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Zap size={18} className="text-noch-green" />
              {ar ? 'استوديو المحتوى' : 'Content Studio'}
            </h1>
            {activeBrand && (
              <p className="text-noch-muted text-sm mt-0.5">{activeBrand.name}</p>
            )}
          </div>
          {isOwner && !noBrands && (
            <button
              onClick={() => navigate('/content/brand/setup')}
              className="btn-secondary p-2"
              title="New brand"
            >
              <Plus size={16} />
            </button>
          )}
        </div>

        {/* No brands */}
        {noBrands && (
          <div className="card text-center py-10">
            <div className="w-14 h-14 bg-noch-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap size={24} className="text-noch-green" />
            </div>
            <h2 className="text-white font-bold mb-2">
              {ar ? 'ابدأ هنا' : 'Get started'}
            </h2>
            <p className="text-noch-muted text-sm mb-5 max-w-xs mx-auto">
              {ar ? 'أنشئ ملف علامتك التجارية أولاً' : 'Create your brand profile first'}
            </p>
            {isOwner && (
              <div className="flex items-center justify-center gap-3">
                <button onClick={seedNoch} disabled={seeding} className="btn-primary flex items-center gap-2">
                  <Zap size={14} /> {seeding ? '...' : (ar ? 'نوتشي جاهز' : 'Seed Noch')}
                </button>
                <button onClick={() => navigate('/content/brand/setup')} className="btn-secondary">
                  {ar ? 'من الصفر' : 'From scratch'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Brand selector (when multiple brands) */}
        {brands.length > 1 && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            {brands.map(b => (
              <button
                key={b.id}
                onClick={() => { setActiveBrand(b); loadBrandExtras(b.id) }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  activeBrand?.id === b.id
                    ? 'bg-noch-green text-noch-dark'
                    : 'border border-noch-border text-noch-muted hover:border-noch-green/40 hover:text-white'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        {/* Main actions — 3 tiles */}
        {activeBrand && (
          <>
            {/* Today's Brief */}
            <TodayBrief
              brandId={activeBrand.id}
              candidateCount={candidateCount}
              navigate={navigate}
              ar={ar}
            />

            <div className="grid grid-cols-1 gap-3 mb-5">
              <ActionTile
                emoji="✍️"
                title={ar ? 'إنشاء محتوى' : 'Create Content'}
                desc={ar ? 'ولّد منشور بالليبي أو الإنجليزي. مباشر من Claude.' : 'Generate a post in Libyan Arabic or English. Direct from Claude.'}
                onClick={() => navigate(`/content/studio?brand=${activeBrand.id}`)}
                primary
              />
              <div className="grid grid-cols-2 gap-3">
                <ActionTile
                  emoji="👀"
                  title={ar ? 'مراجعة المحتوى' : 'Review Queue'}
                  desc={ar ? 'قيّم وانشر مسوداتك' : 'Rate and publish drafts'}
                  onClick={() => navigate(`/content/review?brand=${activeBrand.id}`)}
                />
                <ActionTile
                  emoji="⚙️"
                  title={ar ? 'إعدادات العلامة' : 'Brand Settings'}
                  desc={ar ? 'صوت العلامة والبرنامج' : 'Voice, program, identity'}
                  onClick={() => navigate(`/content/brand/${activeBrand.id}`)}
                />
              </div>
              <ActionTile
                emoji="💡"
                title={ar ? 'بنك الأفكار' : 'Idea Bank'}
                desc={ar ? 'احفظ وقيّم أفكار المحتوى. اسمع من كلود.' : 'Save, score, and develop content ideas with AI.'}
                onClick={() => navigate(`/content/ideas?brand=${activeBrand.id}`)}
              />
            </div>

            {/* Self-improvement loop button */}
            {isOwner && (
              <div className="flex items-center gap-2 mb-5">
                <button
                  onClick={handleImproveLoop}
                  disabled={improving}
                  className="btn-secondary flex items-center gap-2 text-sm w-full justify-center py-2.5"
                >
                  <RefreshCw size={14} className={improving ? 'animate-spin' : ''} />
                  {improving
                    ? (ar ? 'جارٍ التحسين...' : 'Improving...')
                    : (ar ? '🔁 تحسين برنامج العلامة (Karpathy Loop)' : '🔁 Run Improvement Loop')}
                </button>
              </div>
            )}

            {/* Active Series */}
            <div className="card mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <List size={14} className="text-noch-green" />
                  <span className="text-white font-semibold text-sm">{ar ? 'السلاسل النشطة' : 'Active Series'}</span>
                </div>
                <button
                  onClick={() => setShowNewSeries(true)}
                  className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                >
                  <Plus size={10} />
                  {ar ? 'سلسلة جديدة' : 'New Series'}
                </button>
              </div>

              {seriesList.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-3">
                  {ar ? 'لا توجد سلاسل بعد' : 'No active series yet. Create recurring content themes.'}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {seriesList.slice(0, 4).map(s => (
                    <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-noch-border/50 last:border-0">
                      <div>
                        <p className="text-white text-sm font-medium">{s.name}</p>
                        <p className="text-noch-muted text-xs capitalize">{s.pillar} · {s.cadence || 'custom'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-noch-green text-sm font-bold">{s.post_count}</p>
                        <p className="text-noch-muted text-xs">posts</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* New Series Modal */}
            {showNewSeries && (
              <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-xs p-5">
                  <h2 className="text-white font-bold mb-4">{ar ? 'سلسلة جديدة' : 'New Series'}</h2>
                  <label className="label block mb-1">Name *</label>
                  <input
                    value={newSeriesForm.name}
                    onChange={e => setNewSeriesForm(f => ({ ...f, name: e.target.value }))}
                    className="input w-full mb-3"
                    placeholder="Monday Madness"
                  />
                  <label className="label block mb-1">Pillar *</label>
                  <select
                    value={newSeriesForm.pillar}
                    onChange={e => setNewSeriesForm(f => ({ ...f, pillar: e.target.value }))}
                    className="input w-full mb-3"
                  >
                    <option value="">— Select —</option>
                    {['notchis_world', 'the_drop', 'craft_moment', 'real_moment', 'reactive', 'joyful_nihilism'].map(p => (
                      <option key={p} value={p}>{p.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <label className="label block mb-1">Cadence</label>
                  <select
                    value={newSeriesForm.cadence}
                    onChange={e => setNewSeriesForm(f => ({ ...f, cadence: e.target.value }))}
                    className="input w-full mb-3"
                  >
                    {['daily', 'weekly', 'monthly', 'custom'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <label className="label block mb-1">Template hint (optional)</label>
                  <textarea
                    value={newSeriesForm.template_hint}
                    onChange={e => setNewSeriesForm(f => ({ ...f, template_hint: e.target.value }))}
                    className="input w-full resize-none mb-4"
                    rows={2}
                    placeholder="Always starts with a rhetorical question..."
                  />
                  <div className="flex gap-3">
                    <button onClick={() => setShowNewSeries(false)} className="btn-secondary flex-1">Cancel</button>
                    <button onClick={handleCreateSeries} disabled={savingSeries} className="btn-primary flex-1">
                      {savingSeries ? '...' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Content gap */}
            <GapCard brandId={activeBrand.id} navigate={navigate} />
          </>
        )}
      </div>
    </Layout>
  )
}
