import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Check, Upload, Plus, X } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { createBrand, createBrandMaterial, updateBrand } from '../../lib/supabase'
import { buildBrandProgram } from '../../lib/contentEngine'
import toast from 'react-hot-toast'

const VOICE_ARCHETYPES = [
  { value: 'confident-chaotic', label: 'Confident Chaotic', desc: 'Bold, unhinged-adjacent, never boring. Chaos is the strategy.' },
  { value: 'warm-professional', label: 'Warm Professional', desc: 'Friendly, reliable, trustworthy. Cares without being sappy.' },
  { value: 'edgy-minimal', label: 'Edgy Minimal', desc: 'Less is more. Every word earns its place. Dark aesthetic.' },
  { value: 'playful-wholesome', label: 'Playful Wholesome', desc: 'Light, fun, approachable. Makes people smile without edge.' },
  { value: 'intellectual-dry', label: 'Intellectual Dry', desc: 'Cerebral humor. Expects the audience to keep up. No hand-holding.' },
  { value: 'community-first', label: 'Community First', desc: 'Built around the customer. Their stories are the content.' },
]

const INSPIRATION_BRANDS = [
  "Wendy's", "Duolingo", "Ryanair", "Oatly", "Surreal Cereal",
  "Perfect Ted", "Dark Arts Coffee", "Liquid Death", "BrewDog", "Gymshark",
]

const DIALECTS = [
  { value: 'libyan-tripoli', label: 'Libyan Tripoli', desc: 'تلهجة الطرابلسية — Gen Z Tripoli speak' },
  { value: 'msa', label: 'Modern Standard Arabic', desc: 'Formal Arabic (فصحى) for broad reach' },
  { value: 'english', label: 'English Only', desc: 'Pure English brand voice' },
  { value: 'mixed', label: 'Mixed / Bilingual', desc: 'Both languages, naturally code-switched' },
]

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram', icon: '📸' },
  { value: 'facebook', label: 'Facebook', icon: '👥' },
  { value: 'tiktok', label: 'TikTok', icon: '🎵' },
  { value: 'twitter', label: 'Twitter / X', icon: '🐦' },
]

const CATEGORIES = [
  { value: 'cafe', label: 'Café' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'retail', label: 'Retail' },
  { value: 'food-product', label: 'Food Product' },
  { value: 'other', label: 'Other' },
]

const STEPS = ['Brand Basics', 'Voice & Personality', 'Language & Platforms', 'Training Materials']

export default function BrandSetup() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    name_ar: '',
    tagline: '',
    tagline_ar: '',
    category: 'cafe',
    voice_archetype: '',
    voice_inspirations: [],
    personality_notes: '',
    target_audience: '',
    dialect: 'libyan-tripoli',
    platforms: ['instagram', 'facebook'],
    primary_color: '#4ADE80',
  })

  const [materials, setMaterials] = useState([])
  const [newMaterial, setNewMaterial] = useState({ type: 'caption_example', title: '', content: '', url: '', notes: '' })

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function togglePlatform(p) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }))
  }

  function toggleInspiration(b) {
    setForm(f => ({
      ...f,
      voice_inspirations: f.voice_inspirations.includes(b)
        ? f.voice_inspirations.filter(x => x !== b)
        : [...f.voice_inspirations, b],
    }))
  }

  function addMaterial() {
    if (!newMaterial.content && !newMaterial.url) return
    setMaterials(m => [...m, { ...newMaterial, id: Date.now() }])
    setNewMaterial({ type: 'caption_example', title: '', content: '', url: '', notes: '' })
  }

  function removeMaterial(id) {
    setMaterials(m => m.filter(x => x.id !== id))
  }

  async function submit() {
    if (!form.name.trim()) { toast.error('Brand name required'); return }
    setSaving(true)
    try {
      const brand = await createBrand({
        ...form,
        created_by: profile?.id,
      })
      // Generate brand program
      const program = buildBrandProgram(brand, materials)
      await updateBrand(brand.id, { brand_program: program })

      // Save training materials
      for (const mat of materials) {
        await createBrandMaterial({
          brand_id: brand.id,
          type: mat.type,
          title: mat.title,
          content: mat.content,
          url: mat.url,
          notes: mat.notes,
        })
      }

      toast.success(`${brand.name} is ready!`)
      navigate(`/content`)
    } catch (e) {
      toast.error('Failed to create brand: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const canNext = [
    form.name.trim().length > 0,
    form.voice_archetype.length > 0,
    form.dialect.length > 0 && form.platforms.length > 0,
    true,
  ]

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-4">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 whitespace-nowrap">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? 'bg-noch-green text-noch-dark' :
                i === step ? 'border-2 border-noch-green text-noch-green' :
                'border border-noch-border text-noch-muted'
              }`}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className={`text-xs font-medium ${i === step ? 'text-white' : 'text-noch-muted'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-noch-border" />}
            </div>
          ))}
        </div>

        <div className="card p-6">
          {/* Step 1: Brand Basics */}
          {step === 0 && (
            <div>
              <h2 className="text-white font-bold text-lg mb-1">Brand Basics</h2>
              <p className="text-noch-muted text-sm mb-6">The foundation. Who are you?</p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-noch-muted text-xs mb-1">Brand Name *</label>
                    <input className="input w-full" placeholder="e.g. Noch" value={form.name} onChange={e => setField('name', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-noch-muted text-xs mb-1">Arabic Name</label>
                    <input className="input w-full text-right" dir="rtl" placeholder="نوش" value={form.name_ar} onChange={e => setField('name_ar', e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-noch-muted text-xs mb-1">Tagline (EN)</label>
                    <input className="input w-full" placeholder="Matcha. Chaos. Tripoli." value={form.tagline} onChange={e => setField('tagline', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-noch-muted text-xs mb-1">Tagline (AR)</label>
                    <input className="input w-full text-right" dir="rtl" placeholder="ماتشا. فوضى. طرابلس." value={form.tagline_ar} onChange={e => setField('tagline_ar', e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="block text-noch-muted text-xs mb-2">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setField('category', c.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          form.category === c.value
                            ? 'bg-noch-green text-noch-dark'
                            : 'border border-noch-border text-noch-muted hover:text-white hover:border-noch-green/40'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-noch-muted text-xs mb-1">Brand Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.primary_color}
                      onChange={e => setField('primary_color', e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-noch-border bg-transparent"
                    />
                    <input
                      className="input flex-1"
                      value={form.primary_color}
                      onChange={e => setField('primary_color', e.target.value)}
                      placeholder="#4ADE80"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Voice & Personality */}
          {step === 1 && (
            <div>
              <h2 className="text-white font-bold text-lg mb-1">Voice & Personality</h2>
              <p className="text-noch-muted text-sm mb-6">This defines how your brand speaks. Choose carefully.</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-noch-muted text-xs mb-2">Voice Archetype *</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {VOICE_ARCHETYPES.map(a => (
                      <button
                        key={a.value}
                        onClick={() => setField('voice_archetype', a.value)}
                        className={`p-3 rounded-xl text-left border transition-colors ${
                          form.voice_archetype === a.value
                            ? 'border-noch-green bg-noch-green/5'
                            : 'border-noch-border hover:border-noch-green/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {form.voice_archetype === a.value && <Check size={12} className="text-noch-green" />}
                          <span className="text-white text-xs font-bold">{a.label}</span>
                        </div>
                        <p className="text-noch-muted text-xs">{a.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-noch-muted text-xs mb-2">Brand Inspirations (select all that apply)</label>
                  <div className="flex flex-wrap gap-2">
                    {INSPIRATION_BRANDS.map(b => (
                      <button
                        key={b}
                        onClick={() => toggleInspiration(b)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          form.voice_inspirations.includes(b)
                            ? 'bg-noch-green text-noch-dark'
                            : 'border border-noch-border text-noch-muted hover:text-white hover:border-noch-green/40'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-noch-muted text-xs mb-1">Personality Notes</label>
                  <textarea
                    className="input w-full h-24 resize-none text-sm"
                    placeholder="Describe the brand personality in your own words. What would the brand say at a party? What would it never say? What makes it distinctive?"
                    value={form.personality_notes}
                    onChange={e => setField('personality_notes', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-noch-muted text-xs mb-1">Target Audience</label>
                  <input
                    className="input w-full"
                    placeholder="e.g. Gen Z Libyans 18-28, matcha-curious, meme-literate"
                    value={form.target_audience}
                    onChange={e => setField('target_audience', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Language & Platforms */}
          {step === 2 && (
            <div>
              <h2 className="text-white font-bold text-lg mb-1">Language & Platforms</h2>
              <p className="text-noch-muted text-sm mb-6">Where does your brand live and how does it speak?</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-noch-muted text-xs mb-2">Primary Dialect *</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {DIALECTS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => setField('dialect', d.value)}
                        className={`p-3 rounded-xl text-left border transition-colors ${
                          form.dialect === d.value
                            ? 'border-noch-green bg-noch-green/5'
                            : 'border-noch-border hover:border-noch-green/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          {form.dialect === d.value && <Check size={12} className="text-noch-green" />}
                          <span className="text-white text-xs font-bold">{d.label}</span>
                        </div>
                        <p className="text-noch-muted text-xs">{d.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-noch-muted text-xs mb-2">Platforms *</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {PLATFORMS.map(p => (
                      <button
                        key={p.value}
                        onClick={() => togglePlatform(p.value)}
                        className={`p-3 rounded-xl flex flex-col items-center gap-1 border transition-colors ${
                          form.platforms.includes(p.value)
                            ? 'border-noch-green bg-noch-green/5'
                            : 'border-noch-border hover:border-noch-green/30'
                        }`}
                      >
                        <span className="text-xl">{p.icon}</span>
                        <span className="text-xs font-medium text-white">{p.label}</span>
                        {form.platforms.includes(p.value) && <Check size={12} className="text-noch-green" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Training Materials */}
          {step === 3 && (
            <div>
              <h2 className="text-white font-bold text-lg mb-1">Training Materials</h2>
              <p className="text-noch-muted text-sm mb-6">Feed the AI examples of your brand voice. The more you add, the better the output.</p>

              {/* Add new material */}
              <div className="border border-dashed border-noch-border rounded-xl p-4 mb-4">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-noch-muted text-xs mb-1">Type</label>
                    <select
                      className="input w-full text-sm"
                      value={newMaterial.type}
                      onChange={e => setNewMaterial(m => ({ ...m, type: e.target.value }))}
                    >
                      <option value="caption_example">Caption Example</option>
                      <option value="post_example">Post Example</option>
                      <option value="url">Reference URL</option>
                      <option value="document">Document / Notes</option>
                      <option value="competitor">Competitor Reference</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-noch-muted text-xs mb-1">Title</label>
                    <input
                      className="input w-full text-sm"
                      placeholder="e.g. Best performing post"
                      value={newMaterial.title}
                      onChange={e => setNewMaterial(m => ({ ...m, title: e.target.value }))}
                    />
                  </div>
                </div>

                {newMaterial.type === 'url' ? (
                  <input
                    className="input w-full text-sm mb-2"
                    placeholder="https://..."
                    value={newMaterial.url}
                    onChange={e => setNewMaterial(m => ({ ...m, url: e.target.value }))}
                  />
                ) : (
                  <textarea
                    className="input w-full h-20 resize-none text-sm mb-2"
                    placeholder="Paste caption, post copy, or brand notes here…"
                    value={newMaterial.content}
                    onChange={e => setNewMaterial(m => ({ ...m, content: e.target.value }))}
                  />
                )}

                <input
                  className="input w-full text-sm mb-3"
                  placeholder="What should the AI learn from this? (optional)"
                  value={newMaterial.notes}
                  onChange={e => setNewMaterial(m => ({ ...m, notes: e.target.value }))}
                />

                <button onClick={addMaterial} className="btn-primary flex items-center gap-2 text-sm">
                  <Plus size={14} /> Add Material
                </button>
              </div>

              {/* Materials list */}
              {materials.length > 0 ? (
                <div className="space-y-2">
                  {materials.map(mat => (
                    <div key={mat.id} className="flex items-start gap-3 p-3 bg-noch-border/20 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-noch-green capitalize">{mat.type.replace('_', ' ')}</span>
                          {mat.title && <span className="text-noch-muted text-xs">· {mat.title}</span>}
                        </div>
                        <p className="text-white text-xs line-clamp-2">{mat.content || mat.url}</p>
                      </div>
                      <button onClick={() => removeMaterial(mat.id)} className="text-noch-muted hover:text-red-400 transition-colors p-1">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-noch-muted text-sm text-center py-4">No materials added yet. You can also skip this and add later.</p>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-noch-border">
            <button
              onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/content')}
              className="flex items-center gap-2 px-4 py-2 border border-noch-border rounded-lg text-noch-muted hover:text-white hover:border-noch-green/40 transition-colors text-sm"
            >
              <ChevronLeft size={15} />
              {step === 0 ? 'Cancel' : 'Back'}
            </button>

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => canNext[step] && setStep(s => s + 1)}
                disabled={!canNext[step]}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
              >
                Next <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={saving}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {saving ? 'Creating...' : (
                  <>
                    <Check size={15} /> Create Brand
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
