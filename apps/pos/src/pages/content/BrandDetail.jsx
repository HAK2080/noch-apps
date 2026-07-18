import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, Plus, Trash2, ArrowLeft, Upload, X, Brain, Zap, RefreshCw, Download, AlertTriangle, Info, Edit3, Check, XCircle, BarChart3, Key, Eye, EyeOff } from 'lucide-react'
import Layout from '../../components/Layout'
import {
  getBrand, updateBrand, getBrandMaterials, createBrandMaterial, deleteBrandMaterial,
  uploadBrandMaterial, analyzeBrandWithNegatives, scoreVoice,
  getVoiceFingerprint, upsertVoiceFingerprint,
  getDialectCorpus, addDialectEntries,
  getNegativeExamples, createNegativeExample, deleteNegativeExample,
} from '../../modules/contentStudio/lib/content-supabase'
import { buildBrandProgram } from '../../lib/contentEngine'
import { getApiKey, setApiKey } from '../../lib/claudeClient'
import { FINGERPRINT_DIMENSIONS, DIMENSION_LABELS, buildBrandGuideHtml } from './brandVoiceGuide'
import toast from 'react-hot-toast'

const NEGATIVE_TAGS = ['too_formal', 'too_casual', 'wrong_dialect', 'bad_humor', 'competitor_style', 'generic']

function scoreColor(score) {
  if (score >= 7) return 'bg-emerald-400'
  if (score >= 4) return 'bg-yellow-400'
  return 'bg-red-400'
}

function confidenceBadge(confidence) {
  if (confidence >= 7) return 'text-emerald-400'
  if (confidence >= 4) return 'text-yellow-400'
  return 'text-red-400'
}

export default function BrandDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [brand, setBrand] = useState(null)
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({})
  const [newMat, setNewMat] = useState({ type: 'caption_example', title: '', content: '', url: '', notes: '' })
  const [uploadingFile, setUploadingFile] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [voiceText, setVoiceText] = useState('')
  const [voiceScoring, setVoiceScoring] = useState(false)
  const [voiceResult, setVoiceResult] = useState(null)

  // Voice fingerprint state
  const [fingerprint, setFingerprint] = useState({})
  const [selfAssessment, setSelfAssessment] = useState(null)
  const [dialectExtractions, setDialectExtractions] = useState([])
  const [editingDimension, setEditingDimension] = useState(null)
  const [editScore, setEditScore] = useState('')

  // API key
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)

  // Negative examples state
  const [negativeExamples, setNegativeExamples] = useState([])
  const [materialsTab, setMaterialsTab] = useState('training') // 'training' | 'negative'
  const [newNegative, setNewNegative] = useState({ content: '', why_bad: '', tags: [], platform: '' })

  // Voice verifier save-as-negative state
  const [showNegativePrompt, setShowNegativePrompt] = useState(false)
  const [negativeWhyBad, setNegativeWhyBad] = useState('')

  useEffect(() => { load() }, [id])

  async function load() {
    try {
      const [b, m, neg] = await Promise.all([
        getBrand(id),
        getBrandMaterials(id),
        getNegativeExamples(id).catch(() => []),
      ])
      setBrand(b)
      setMaterials(m)
      setNegativeExamples(neg)
      setForm({
        name: b.name || '',
        name_ar: b.name_ar || '',
        tagline: b.tagline || '',
        tagline_ar: b.tagline_ar || '',
        voice_archetype: b.voice_archetype || '',
        personality_notes: b.personality_notes || '',
        target_audience: b.target_audience || '',
        primary_color: b.primary_color || '#4ADE80',
        brand_program: b.brand_program || '',
      })

      // Load voice fingerprint from DB or from brand JSON
      try {
        const fp = await getVoiceFingerprint(id)
        if (fp && fp.length > 0) {
          const fpMap = {}
          fp.forEach(f => { fpMap[f.dimension] = { score: f.score, confidence: f.confidence, evidence: f.evidence } })
          setFingerprint(fpMap)
        } else if (b.voice_fingerprint_json) {
          setFingerprint(b.voice_fingerprint_json)
        }
      } catch { /* fingerprint table may not exist yet */ }

      // Load self_assessment from extracted_patterns if available
      if (b.extracted_patterns?.self_assessment) {
        setSelfAssessment(b.extracted_patterns.self_assessment)
      }

      // Load dialect corpus
      try {
        const dc = await getDialectCorpus(id)
        if (dc && dc.length > 0) setDialectExtractions(dc)
      } catch { /* table may not exist */ }
    } catch { toast.error('Failed to load brand') }
    finally { setLoading(false) }
  }

  async function save() {
    setSaving(true)
    try {
      await updateBrand(id, form)
      toast.success('Brand updated')
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  async function regenerateProgram() {
    setSaving(true)
    try {
      const program = buildBrandProgram(brand, materials)
      await updateBrand(id, { brand_program: program })
      setForm(f => ({ ...f, brand_program: program }))
      toast.success('Brand program regenerated')
    } catch { toast.error('Failed') }
    finally { setSaving(false) }
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const invalid = files.filter(f => !f.type.startsWith('image/'))
    if (invalid.length) { toast.error('Images only (JPG, PNG, etc.)'); return }
    const newItems = files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))
    setPendingFiles(prev => [...prev, ...newItems])
    setNewMat(m => ({ ...m, type: 'post_screenshot' }))
    e.target.value = ''
  }

  function removeFile(idx) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function runAnalysis() {
    if (materials.length === 0) {
      toast.error('Add training materials first, then run analysis')
      return
    }
    setAnalyzing(true)
    setAnalysisResult(null)
    try {
      toast.loading('Analyzing materials with Claude...', { id: 'analyze' })
      const result = await analyzeBrandWithNegatives(brand, materials, negativeExamples)
      setAnalysisResult(result.analysis)

      // Auto-save the updated program
      const updates = { brand_program: result.updatedProgram }

      // Save fingerprint if returned
      if (result.fingerprint) {
        setFingerprint(result.fingerprint)
        updates.voice_fingerprint_json = result.fingerprint
        // Save individual dimensions to voice_fingerprint table
        for (const dim of FINGERPRINT_DIMENSIONS) {
          if (result.fingerprint[dim]) {
            try {
              await upsertVoiceFingerprint(id, dim, {
                ...result.fingerprint[dim],
                source: 'auto_analysis',
                source_weight: 1,
              })
            } catch { /* skip if table doesn't exist */ }
          }
        }
      }

      // Save self-assessment
      if (result.selfAssessment) {
        setSelfAssessment(result.selfAssessment)
        updates.extracted_patterns = {
          ...(brand.extracted_patterns || {}),
          self_assessment: result.selfAssessment,
        }
      }

      // Save dialect extractions
      if (result.dialectExtractions && result.dialectExtractions.length > 0) {
        setDialectExtractions(result.dialectExtractions)
        try {
          const entries = result.dialectExtractions.map(d => ({
            brand_id: id,
            phrase_ar: d.phrase_ar,
            phrase_en: d.phrase_en,
            context: d.context || '',
            category: d.category || 'other',
            source: 'auto_analysis',
            frequency: 1,
          }))
          await addDialectEntries(entries)
        } catch { /* skip if table doesn't exist */ }
      }

      await updateBrand(id, updates)
      setForm(f => ({ ...f, brand_program: result.updatedProgram }))
      toast.success('Brand program updated from your materials!', { id: 'analyze' })
    } catch (e) {
      toast.error(
        e.message?.includes('ANTHROPIC_API_KEY')
          ? 'API key not set — see instructions below'
          : 'Analysis failed: ' + (e.message || 'unknown'),
        { id: 'analyze' }
      )
    } finally {
      setAnalyzing(false)
    }
  }

  async function addMaterial() {
    if (!newMat.content && !newMat.url && pendingFiles.length === 0) {
      toast.error('Add some content, a URL, or upload images')
      return
    }
    setUploadingFile(true)
    try {
      if (pendingFiles.length > 0) {
        for (const { file } of pendingFiles) {
          const fileUrl = await uploadBrandMaterial(id, file)
          const m = await createBrandMaterial({
            brand_id: id,
            type: 'post_screenshot',
            title: newMat.title || file.name.replace(/\.[^.]+$/, ''),
            content: newMat.content,
            notes: newMat.notes,
            file_url: fileUrl,
            url: fileUrl,
          })
          setMaterials(ms => [m, ...ms])
        }
        toast.success(`${pendingFiles.length} image${pendingFiles.length > 1 ? 's' : ''} added`)
      } else {
        const m = await createBrandMaterial({ brand_id: id, ...newMat })
        setMaterials(ms => [m, ...ms])
        toast.success('Material added')
      }
      setNewMat({ type: 'caption_example', title: '', content: '', url: '', notes: '' })
      setPendingFiles([])
    } catch (e) {
      toast.error('Failed to add: ' + (e.message || 'unknown error'))
    } finally {
      setUploadingFile(false)
    }
  }

  async function removeMaterial(mid) {
    try {
      await deleteBrandMaterial(mid)
      setMaterials(ms => ms.filter(m => m.id !== mid))
    } catch { toast.error('Failed to remove') }
  }

  async function handleDimensionEdit(dimension, newScore) {
    const score = parseInt(newScore)
    if (isNaN(score) || score < 1 || score > 10) { toast.error('Score must be 1-10'); return }
    try {
      await upsertVoiceFingerprint(id, dimension, {
        score,
        confidence: 10,
        evidence: fingerprint[dimension]?.evidence || 'Manual override',
        source: 'manual_override',
        source_weight: 3,
      })
      setFingerprint(fp => ({
        ...fp,
        [dimension]: { ...fp[dimension], score, confidence: 10, evidence: fp[dimension]?.evidence || 'Manual override' }
      }))
      // Also update brand JSON
      const updatedFp = { ...fingerprint, [dimension]: { ...fingerprint[dimension], score, confidence: 10 } }
      await updateBrand(id, { voice_fingerprint_json: updatedFp })
      setEditingDimension(null)
      toast.success(`${DIMENSION_LABELS[dimension]} updated to ${score}`)
    } catch (e) {
      toast.error('Failed to save: ' + (e.message || ''))
    }
  }

  async function saveAsTraining() {
    if (!voiceText.trim()) return
    try {
      const m = await createBrandMaterial({
        brand_id: id,
        type: 'caption_example',
        title: 'Voice-verified content',
        content: voiceText,
        notes: `Voice score: ${JSON.stringify(voiceResult)}`,
        source_weight: 3,
      })
      setMaterials(ms => [m, ...ms])
      toast.success('Saved as training material (weight: 3)')
    } catch (e) { toast.error('Failed: ' + (e.message || '')) }
  }

  async function saveAsNegative() {
    if (!voiceText.trim()) return
    try {
      const neg = await createNegativeExample({
        brand_id: id,
        content: voiceText,
        source: 'voice_verifier',
        why_bad: negativeWhyBad || 'Rejected via voice verifier',
        tags: ['voice_mismatch'],
        source_weight: 3,
      })
      setNegativeExamples(prev => [neg, ...prev])
      setShowNegativePrompt(false)
      setNegativeWhyBad('')
      toast.success('Saved as negative example (weight: 3)')
    } catch (e) { toast.error('Failed: ' + (e.message || '')) }
  }

  async function addNegativeExample() {
    if (!newNegative.content.trim()) { toast.error('Paste some content'); return }
    try {
      const neg = await createNegativeExample({
        brand_id: id,
        content: newNegative.content,
        why_bad: newNegative.why_bad,
        tags: newNegative.tags,
        platform: newNegative.platform || null,
        source: 'manual',
        source_weight: 3,
      })
      setNegativeExamples(prev => [neg, ...prev])
      setNewNegative({ content: '', why_bad: '', tags: [], platform: '' })
      toast.success('Negative example added')
    } catch (e) { toast.error('Failed: ' + (e.message || '')) }
  }

  async function removeNegative(negId) {
    try {
      await deleteNegativeExample(negId)
      setNegativeExamples(prev => prev.filter(n => n.id !== negId))
      toast.success('Removed')
    } catch { toast.error('Failed') }
  }

  function exportBrandGuide() {
    const html = buildBrandGuideHtml(brand, { fingerprint, dialectExtractions, materials, negativeExamples })
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    toast.success('Brand guide opening — click "Save as PDF" in the print dialog')
  }

  if (loading) return <Layout><div className="flex items-center justify-center h-64"><p className="text-noch-muted">Loading...</p></div></Layout>
  if (!brand) return <Layout><div className="text-noch-muted p-8">Brand not found</div></Layout>

  const hasFingerprint = Object.keys(fingerprint).length > 0

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/content')} className="text-noch-muted hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-white font-bold text-xl">{brand.name} — Brand Settings</h1>
        </div>

        <div className="space-y-4">
          {/* API Key */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Key size={14} className="text-noch-green" />
              <h2 className="text-white font-semibold">Anthropic API Key</h2>
              {getApiKey() && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">active</span>}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={apiKeyVisible ? 'text' : 'password'}
                  className="input w-full pr-8 font-mono text-xs"
                  placeholder="sk-ant-api03-..."
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setApiKeyVisible(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-noch-muted hover:text-white"
                >
                  {apiKeyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button
                onClick={() => {
                  setApiKey(apiKeyInput)
                  toast.success('API key saved')
                }}
                className="btn-primary px-4 text-sm flex items-center gap-1.5"
              >
                <Save size={13} /> Save
              </button>
              {getApiKey() && (
                <button
                  onClick={() => { setApiKey(''); setApiKeyInput(''); toast.success('Key cleared') }}
                  className="btn-secondary px-3"
                  title="Clear key"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <p className="text-noch-muted text-[10px] mt-2">Stored in browser only. Never sent to our servers.</p>
          </div>

          {/* Basic Info */}
          <div className="card p-5">
            <h2 className="text-white font-semibold mb-4">Brand Identity</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-noch-muted text-xs mb-1">Name (EN)</label>
                <input className="input w-full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-noch-muted text-xs mb-1">Name (AR)</label>
                <input className="input w-full text-right" dir="rtl" value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} />
              </div>
              <div>
                <label className="block text-noch-muted text-xs mb-1">Tagline (EN)</label>
                <input className="input w-full" value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} />
              </div>
              <div>
                <label className="block text-noch-muted text-xs mb-1">Tagline (AR)</label>
                <input className="input w-full text-right" dir="rtl" value={form.tagline_ar} onChange={e => setForm(f => ({ ...f, tagline_ar: e.target.value }))} />
              </div>
              <div>
                <label className="block text-noch-muted text-xs mb-1">Voice Archetype</label>
                <input className="input w-full" value={form.voice_archetype} onChange={e => setForm(f => ({ ...f, voice_archetype: e.target.value }))} />
              </div>
              <div>
                <label className="block text-noch-muted text-xs mb-1">Brand Color</label>
                <div className="flex gap-2">
                  <input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} className="w-10 h-10 rounded-lg border border-noch-border bg-transparent" />
                  <input className="input flex-1" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-noch-muted text-xs mb-1">Personality Notes</label>
              <textarea className="input w-full h-20 resize-none" value={form.personality_notes} onChange={e => setForm(f => ({ ...f, personality_notes: e.target.value }))} />
            </div>
            <div className="mt-3">
              <label className="block text-noch-muted text-xs mb-1">Target Audience</label>
              <input className="input w-full" value={form.target_audience} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))} />
            </div>
            <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 mt-4 text-sm">
              <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {/* ── VOICE FINGERPRINT SECTION ── */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <BarChart3 size={18} className="text-noch-green" /> Voice Fingerprint
              </h2>
              {hasFingerprint && (
                <button onClick={exportBrandGuide} className="text-xs text-noch-green border border-noch-green/30 px-3 py-1.5 rounded-lg hover:bg-noch-green/10 transition-colors flex items-center gap-1.5">
                  <Download size={13} /> Export Brand Guide
                </button>
              )}
            </div>

            {hasFingerprint ? (
              <>
                {/* Dimension bars */}
                <div className="space-y-2.5 mb-5">
                  {FINGERPRINT_DIMENSIONS.map(dim => {
                    const d = fingerprint[dim]
                    if (!d) return null
                    const score = d.score || 0
                    const confidence = d.confidence || 0
                    const pct = score * 10
                    const isLowConfidence = confidence < 5
                    return (
                      <div key={dim}>
                        <div className="flex items-center gap-2">
                          <span className="text-noch-muted text-xs w-28 shrink-0">{DIMENSION_LABELS[dim]}</span>
                          <div
                            className={`flex-1 h-3 bg-noch-border rounded-full overflow-hidden ${isLowConfidence ? 'border border-dashed border-noch-muted/40' : ''}`}
                          >
                            <div
                              className={`h-full rounded-full transition-all ${scoreColor(score)} ${isLowConfidence ? 'opacity-50' : ''}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {editingDimension === dim ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                max="10"
                                className="input w-12 text-xs text-center py-0.5"
                                value={editScore}
                                onChange={e => setEditScore(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleDimensionEdit(dim, editScore) }}
                                autoFocus
                              />
                              <button onClick={() => handleDimensionEdit(dim, editScore)} className="text-noch-green hover:text-emerald-300 p-0.5"><Check size={12} /></button>
                              <button onClick={() => setEditingDimension(null)} className="text-noch-muted hover:text-white p-0.5"><X size={12} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingDimension(dim); setEditScore(String(score)) }}
                              className="text-xs font-bold w-8 text-right text-white hover:text-noch-green transition-colors cursor-pointer"
                              title="Click to edit"
                            >
                              {score}
                            </button>
                          )}
                          <span className={`text-[10px] w-3 ${confidenceBadge(confidence)}`} title={`Confidence: ${confidence}/10`}>
                            {confidence >= 7 ? '' : confidence >= 4 ? '~' : '?'}
                          </span>
                        </div>
                        {d.evidence && (
                          <p className="text-noch-muted text-[10px] ml-[7.5rem] mt-0.5 line-clamp-1 italic">{d.evidence}</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Self-assessment panel */}
                {selfAssessment && (
                  <div className="border-t border-noch-border pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-noch-muted text-xs">Overall Confidence:</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        selfAssessment.overall_confidence >= 7
                          ? 'bg-emerald-400/20 text-emerald-400'
                          : selfAssessment.overall_confidence >= 4
                          ? 'bg-yellow-400/20 text-yellow-400'
                          : 'bg-red-400/20 text-red-400'
                      }`}>
                        {selfAssessment.overall_confidence}/10
                      </span>
                    </div>

                    {selfAssessment.gaps?.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-noch-muted text-xs flex items-center gap-1"><AlertTriangle size={11} className="text-yellow-400" /> Data Gaps</span>
                        {selfAssessment.gaps.map((gap, i) => (
                          <div key={i} className="bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-1.5 text-yellow-300 text-xs">
                            {gap}
                          </div>
                        ))}
                      </div>
                    )}

                    {selfAssessment.recommendations?.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-noch-muted text-xs flex items-center gap-1"><Info size={11} className="text-blue-400" /> Recommendations</span>
                        {selfAssessment.recommendations.map((rec, i) => (
                          <div key={i} className="bg-blue-400/10 border border-blue-400/20 rounded-lg px-3 py-1.5 text-blue-300 text-xs">
                            {rec}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <BarChart3 size={32} className="text-noch-muted/30 mx-auto mb-2" />
                <p className="text-noch-muted text-sm">No voice fingerprint yet</p>
                <p className="text-noch-muted text-xs mt-1">Run "Analyze Training Materials" below to generate one</p>
              </div>
            )}
          </div>

          {/* Brand Program */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-white font-semibold">Brand Program</h2>
                <p className="text-noch-muted text-xs mt-0.5">The evolving AI instruction doc. Self-improves with every scored post.</p>
              </div>
              <button onClick={regenerateProgram} disabled={saving} className="text-xs text-noch-green border border-noch-green/30 px-3 py-1.5 rounded-lg hover:bg-noch-green/10 transition-colors">
                Regenerate
              </button>
            </div>
            <textarea
              className="input w-full h-64 resize-none font-mono text-xs"
              value={form.brand_program}
              onChange={e => setForm(f => ({ ...f, brand_program: e.target.value }))}
            />
            <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 mt-3 text-sm">
              <Save size={14} /> Save Program
            </button>
          </div>

          {/* ── VOICE AUTO-VERIFIER ── */}
          <div className="card p-5">
            <h2 className="text-white font-semibold flex items-center gap-2 mb-1">
              <Zap size={16} className="text-yellow-400" /> Voice Auto-Verifier
            </h2>
            <p className="text-noch-muted text-xs mb-4">Paste any text to score it against the brand voice</p>
            <textarea
              className="input w-full h-24 resize-none text-sm mb-3"
              placeholder="Paste a competitor caption, a draft, or any text to see how it scores against the brand voice..."
              value={voiceText}
              onChange={e => setVoiceText(e.target.value)}
            />
            <button
              onClick={async () => {
                if (!voiceText.trim()) { toast.error('Paste some text first'); return }
                setVoiceScoring(true); setVoiceResult(null); setShowNegativePrompt(false)
                try {
                  const result = await scoreVoice(brand, voiceText)
                  setVoiceResult(result)
                } catch (e) { toast.error('Scoring failed: ' + (e.message || 'unknown')) }
                finally { setVoiceScoring(false) }
              }}
              disabled={voiceScoring || !voiceText.trim()}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {voiceScoring ? <><RefreshCw size={14} className="animate-spin" /> Scoring...</> : <><Zap size={14} /> Score Text</>}
            </button>
            {voiceResult && (
              <div className="mt-4 bg-noch-dark/40 border border-noch-green/20 rounded-xl p-4 space-y-2">
                {[
                  { key: 'voice', label: 'Voice Match' },
                  { key: 'dialect', label: 'Dialect' },
                  { key: 'hook', label: 'Hook Strength' },
                  { key: 'humor', label: 'Humor' },
                  { key: 'relevance', label: 'Relevance' },
                ].map(({ key, label }) => {
                  const score = voiceResult[key] || 0
                  const pct = score * 10
                  const color = pct >= 80 ? 'bg-emerald-400' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400'
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-noch-muted text-xs w-24 shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-noch-border rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold w-6 text-right text-white">{score}</span>
                    </div>
                  )
                })}
                {voiceResult.feedback && (
                  <p className="text-noch-muted text-xs mt-2 pt-2 border-t border-noch-border/30">{voiceResult.feedback}</p>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-3 border-t border-noch-border/30">
                  <button
                    onClick={saveAsTraining}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                  >
                    <Check size={13} /> This IS our voice — save as training
                  </button>
                  <button
                    onClick={() => setShowNegativePrompt(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                  >
                    <XCircle size={13} /> This is NOT our voice — save as negative
                  </button>
                </div>

                {/* Negative prompt */}
                {showNegativePrompt && (
                  <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-2">
                    <label className="text-red-300 text-xs">Why is this bad for the brand?</label>
                    <textarea
                      className="input w-full h-16 resize-none text-xs"
                      placeholder="Explain what makes this off-brand..."
                      value={negativeWhyBad}
                      onChange={e => setNegativeWhyBad(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button onClick={saveAsNegative} className="btn-primary text-xs py-1 px-3">Save as Negative</button>
                      <button onClick={() => setShowNegativePrompt(false)} className="text-noch-muted text-xs hover:text-white">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── ANALYZE TRAINING MATERIALS ── */}
          <div className={`card p-5 border-2 transition-colors ${analyzing ? 'border-noch-green/50 bg-noch-green/5' : 'border-noch-green/20'}`}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-white font-bold flex items-center gap-2">
                  <Brain size={18} className="text-noch-green" /> Analyze Training Materials
                </h2>
                <p className="text-noch-muted text-xs mt-1">
                  Claude reads all your training materials and rewrites the brand program with what it actually learns.
                  {materials.length > 0 ? ` ${materials.length} materials ready.` : ' Add materials below first.'}
                  {negativeExamples.length > 0 ? ` ${negativeExamples.length} negative examples included.` : ''}
                </p>
              </div>
              <button
                onClick={runAnalysis}
                disabled={analyzing || materials.length === 0}
                className="btn-primary flex items-center gap-2 shrink-0 disabled:opacity-50"
              >
                {analyzing
                  ? <><RefreshCw size={15} className="animate-spin" /> Analyzing...</>
                  : <><Zap size={15} /> Analyze Training Materials</>
                }
              </button>
            </div>

            {/* API key notice */}
            <div className="bg-noch-dark/60 border border-noch-border rounded-lg p-3 mb-3">
              <p className="text-noch-muted text-xs font-mono">
                Requires <span className="text-noch-green">ANTHROPIC_API_KEY</span> in Supabase secrets.
                {' '}Set it at: <span className="text-white">supabase.com &rarr; Project &rarr; Edge Functions &rarr; Secrets &rarr; Add ANTHROPIC_API_KEY</span>
              </p>
            </div>

            {/* Analysis result */}
            {analysisResult && (
              <div className="bg-noch-dark/40 border border-noch-green/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-noch-green animate-pulse" />
                  <span className="text-noch-green text-xs font-bold">Analysis complete — Brand program updated</span>
                </div>
                <pre className="text-xs text-white whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-auto">
                  {analysisResult}
                </pre>
              </div>
            )}

            {/* Dialect extractions from last analysis */}
            {dialectExtractions.length > 0 && (
              <div className="mt-3 bg-noch-dark/40 border border-noch-border rounded-xl p-4">
                <h3 className="text-white text-xs font-bold mb-2">Dialect Extractions ({dialectExtractions.length})</h3>
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-auto">
                  {dialectExtractions.map((d, i) => (
                    <div key={d.id || i} className="flex items-center gap-2 text-[11px] bg-noch-border/20 rounded px-2 py-1">
                      <span className="text-noch-green font-bold" dir="rtl">{d.phrase_ar}</span>
                      <span className="text-noch-muted">=</span>
                      <span className="text-white">{d.phrase_en}</span>
                      <span className="text-noch-muted text-[9px] ml-auto">{d.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── TRAINING MATERIALS ── */}
          <div className="card p-5">
            {/* Tab toggle */}
            <div className="flex items-center gap-1 mb-4">
              <button
                onClick={() => setMaterialsTab('training')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${materialsTab === 'training' ? 'bg-noch-green/20 text-noch-green font-semibold' : 'text-noch-muted hover:text-white'}`}
              >
                Training Examples ({materials.length})
              </button>
              <button
                onClick={() => setMaterialsTab('negative')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${materialsTab === 'negative' ? 'bg-red-500/20 text-red-400 font-semibold' : 'text-noch-muted hover:text-white'}`}
              >
                Negative Examples ({negativeExamples.length})
              </button>
            </div>

            {materialsTab === 'training' ? (
              <>
                {/* Add material form */}
                <div className="border border-dashed border-noch-border rounded-xl p-4 mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-noch-muted text-xs mb-1">Type</label>
                      <select className="input w-full text-sm" value={newMat.type} onChange={e => setNewMat(m => ({ ...m, type: e.target.value }))}>
                        <option value="caption_example">Caption Example</option>
                        <option value="post_example">Post Example</option>
                        <option value="post_screenshot">Post Screenshot</option>
                        <option value="url">Reference URL</option>
                        <option value="document">Document</option>
                        <option value="competitor">Competitor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-noch-muted text-xs mb-1">Title (optional)</label>
                      <input className="input w-full text-sm" placeholder="e.g. Best-performing post" value={newMat.title} onChange={e => setNewMat(m => ({ ...m, title: e.target.value }))} />
                    </div>
                  </div>

                  {/* Image upload */}
                  <div>
                    <label className="block text-noch-muted text-xs mb-2">Upload screenshots / images</label>
                    {pendingFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {pendingFiles.map((pf, idx) => (
                          <div key={idx} className="relative">
                            <img src={pf.previewUrl} alt="preview" className="w-20 h-20 object-cover rounded-lg border border-noch-border" />
                            <button
                              onClick={() => removeFile(idx)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
                            >
                              <X size={10} className="text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label className="flex items-center gap-2 px-3 py-2 border border-noch-border rounded-lg text-noch-muted hover:text-white hover:border-noch-green/40 transition-colors cursor-pointer text-sm w-fit">
                      <Upload size={14} />
                      <span>{pendingFiles.length > 0 ? 'Add more images' : 'Choose images'}</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
                    </label>
                  </div>

                  <textarea
                    className="input w-full h-20 resize-none text-sm"
                    placeholder="Paste caption text or notes (optional if uploading image)"
                    value={newMat.content}
                    onChange={e => setNewMat(m => ({ ...m, content: e.target.value }))}
                  />
                  <input
                    className="input w-full text-sm"
                    placeholder="What should the AI learn from this? (optional)"
                    value={newMat.notes}
                    onChange={e => setNewMat(m => ({ ...m, notes: e.target.value }))}
                  />
                  <button
                    onClick={addMaterial}
                    disabled={uploadingFile}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    {uploadingFile ? <><Upload size={14} className="animate-bounce" /> Uploading...</> : <><Plus size={14} /> Add Material</>}
                  </button>
                </div>

                {/* Materials list */}
                <div className="space-y-2">
                  {materials.map(m => (
                    <div key={m.id} className="flex items-start gap-3 p-3 bg-noch-border/20 rounded-lg">
                      {m.file_url && (
                        <img src={m.file_url} alt={m.title || 'material'} className="w-16 h-16 object-cover rounded-lg border border-noch-border shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-noch-green text-xs font-medium capitalize">{m.type?.replace(/_/g, ' ')}</span>
                          {m.title && <span className="text-noch-muted text-xs">· {m.title}</span>}
                        </div>
                        {m.content && <p className="text-white text-xs line-clamp-2">{m.content}</p>}
                        {m.url && !m.file_url && <p className="text-noch-muted text-xs line-clamp-1">{m.url}</p>}
                        {m.notes && <p className="text-noch-muted text-xs mt-0.5 italic">{m.notes}</p>}
                      </div>
                      <button onClick={() => removeMaterial(m.id)} className="text-noch-muted hover:text-red-400 p-1 transition-colors shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {materials.length === 0 && <p className="text-noch-muted text-sm text-center py-4">No training materials yet</p>}
                </div>
              </>
            ) : (
              /* ── NEGATIVE EXAMPLES TAB ── */
              <>
                {/* Add negative example form */}
                <div className="border border-dashed border-red-500/30 rounded-xl p-4 mb-4 space-y-3">
                  <p className="text-red-300 text-xs">Add content that is OFF-BRAND. The AI will learn what to avoid.</p>
                  <textarea
                    className="input w-full h-20 resize-none text-sm"
                    placeholder="Paste the off-brand content here..."
                    value={newNegative.content}
                    onChange={e => setNewNegative(n => ({ ...n, content: e.target.value }))}
                  />
                  <input
                    className="input w-full text-sm"
                    placeholder="Why is this bad for the brand?"
                    value={newNegative.why_bad}
                    onChange={e => setNewNegative(n => ({ ...n, why_bad: e.target.value }))}
                  />
                  <div>
                    <label className="block text-noch-muted text-xs mb-1.5">Tags</label>
                    <div className="flex flex-wrap gap-1.5">
                      {NEGATIVE_TAGS.map(tag => (
                        <button
                          key={tag}
                          onClick={() => {
                            setNewNegative(n => ({
                              ...n,
                              tags: n.tags.includes(tag) ? n.tags.filter(t => t !== tag) : [...n.tags, tag]
                            }))
                          }}
                          className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                            newNegative.tags.includes(tag)
                              ? 'bg-red-500/20 border-red-500/40 text-red-300'
                              : 'border-noch-border text-noch-muted hover:text-white'
                          }`}
                        >
                          {tag.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={addNegativeExample}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                  >
                    <Plus size={14} /> Add Negative Example
                  </button>
                </div>

                {/* Negative examples list */}
                <div className="space-y-2">
                  {negativeExamples.map(n => (
                    <div key={n.id} className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs line-clamp-3 mb-1">{n.content}</p>
                          {n.why_bad && <p className="text-red-300 text-xs italic">Why bad: {n.why_bad}</p>}
                          {n.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {n.tags.map(tag => (
                                <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded-full bg-red-500/10 border border-red-500/20 text-red-300">
                                  {tag.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          )}
                          {n.platform && <span className="text-noch-muted text-[10px] mt-1 block">Platform: {n.platform}</span>}
                        </div>
                        <button onClick={() => removeNegative(n.id)} className="text-noch-muted hover:text-red-400 p-1 transition-colors shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {negativeExamples.length === 0 && (
                    <p className="text-noch-muted text-sm text-center py-4">No negative examples yet</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
