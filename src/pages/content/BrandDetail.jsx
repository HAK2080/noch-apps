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
} from '../../lib/supabase'
import { buildBrandProgram } from '../../lib/contentEngine'
import { getApiKey, setApiKey } from '../../lib/claudeClient'
import toast from 'react-hot-toast'

const FINGERPRINT_DIMENSIONS = [
  'formality', 'humor', 'sarcasm', 'warmth', 'aggression',
  'code_switching', 'dialect_density', 'meme_native', 'cta_directness', 'religious_refs',
]

const DIMENSION_LABELS = {
  formality: 'Formality',
  humor: 'Humor',
  sarcasm: 'Sarcasm',
  warmth: 'Warmth',
  aggression: 'Aggression',
  code_switching: 'Code Switching',
  dialect_density: 'Dialect Density',
  meme_native: 'Meme Native',
  cta_directness: 'CTA Directness',
  religious_refs: 'Religious Refs',
}

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
    const accentColor = brand.primary_color || '#22c55e'
    const goldenPosts = materials.filter(m => m.type === 'caption_example' || m.type === 'post_example').slice(0, 6)

    // Build fingerprint bars HTML
    const fingerprintRows = FINGERPRINT_DIMENSIONS.map(dim => {
      const d = fingerprint[dim]
      if (!d) return ''
      const score = d.score || 5
      const pct = (score / 10) * 100
      const barColor = score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444'
      return `
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.05em">${DIMENSION_LABELS[dim]}</span>
            <span style="font-size:13px;font-weight:700;color:${barColor}">${score}/10</span>
          </div>
          <div style="background:#e5e7eb;border-radius:4px;height:8px">
            <div style="width:${pct}%;background:${barColor};border-radius:4px;height:8px"></div>
          </div>
          ${d.evidence ? `<p style="font-size:11px;color:#6b7280;margin-top:3px;line-height:1.4">${d.evidence}</p>` : ''}
        </div>`
    }).join('')

    // Dialect table rows
    const dialectRows = dialectExtractions.slice(0, 30).map(d => `
      <tr>
        <td style="padding:8px 12px;font-size:14px;font-family:sans-serif;direction:rtl;text-align:right">${d.phrase_ar}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151">${d.phrase_en || '—'}</td>
        <td style="padding:8px 12px;font-size:12px;color:#6b7280">${d.context || '—'}</td>
        <td style="padding:8px 12px"><span style="font-size:11px;padding:2px 8px;border-radius:12px;background:#f3f4f6;color:#374151">${d.category || ''}</span></td>
      </tr>`).join('')

    // Example posts
    const postsHtml = goldenPosts.map((p, i) => `
      <div style="background:#f9fafb;border-left:3px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:12px">
        <p style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.05em;margin:0 0 6px">Example ${i + 1}${p.title ? ' — ' + p.title : ''}</p>
        <p style="font-size:13px;color:#1f2937;line-height:1.6;margin:0;white-space:pre-wrap">${p.content || ''}</p>
      </div>`).join('')

    // Negative examples
    const negativesHtml = negativeExamples.slice(0, 6).map((n, i) => `
      <div style="background:#fef2f2;border-left:3px solid #ef4444;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:10px">
        <p style="font-size:11px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px">❌ Avoid — ${(n.tags || []).join(', ')}</p>
        <p style="font-size:13px;color:#374151;line-height:1.5;margin:0 0 6px">${n.content?.slice(0, 300) || ''}</p>
        ${n.why_bad ? `<p style="font-size:12px;color:#991b1b;margin:0"><strong>Why:</strong> ${n.why_bad}</p>` : ''}
      </div>`).join('')

    // Brand program — extract key sections
    const programText = (brand.brand_program || '').slice(0, 4000)

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${brand.name} — Brand Voice Guide</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
    }
    .cover {
      background: linear-gradient(135deg, #111827 0%, #1f2937 60%, ${accentColor}22 100%);
      min-height: 100vh; display: flex; flex-direction: column;
      justify-content: center; align-items: flex-start; padding: 80px;
    }
    .cover-badge {
      font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
      color: ${accentColor}; background: ${accentColor}22; border: 1px solid ${accentColor}44;
      padding: 6px 14px; border-radius: 20px; margin-bottom: 32px;
    }
    .cover-name { font-size: 72px; font-weight: 900; color: #fff; line-height: 1; margin-bottom: 8px; }
    .cover-name-ar { font-size: 40px; font-weight: 700; color: ${accentColor}; margin-bottom: 24px; font-family: sans-serif; }
    .cover-tagline { font-size: 22px; color: #9ca3af; margin-bottom: 48px; font-style: italic; }
    .cover-meta { display: flex; gap: 32px; }
    .cover-meta-item { }
    .cover-meta-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }
    .cover-meta-value { font-size: 16px; font-weight: 700; color: #e5e7eb; margin-top: 2px; }
    .cover-footer { position: absolute; bottom: 40px; left: 80px; right: 80px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #374151; padding-top: 20px; }
    .cover-footer-text { font-size: 12px; color: #4b5563; }
    section { padding: 48px 64px; }
    section + section { border-top: 1px solid #e5e7eb; }
    .section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${accentColor}; margin-bottom: 8px; }
    h2 { font-size: 28px; font-weight: 800; color: #111827; margin-bottom: 24px; }
    h3 { font-size: 16px; font-weight: 700; color: #374151; margin-bottom: 12px; }
    p { line-height: 1.7; color: #374151; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
    tr:nth-child(even) { background: #f9fafb; }
    .tag { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: ${accentColor}22; color: ${accentColor}; margin: 2px; }
    .print-btn { position: fixed; bottom: 24px; right: 24px; background: ${accentColor}; color: #000; border: none; padding: 14px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 20px ${accentColor}66; z-index: 999; }
    .print-btn:hover { opacity: 0.9; }
    .program-text { white-space: pre-wrap; font-size: 13px; line-height: 1.75; color: #374151; background: #f9fafb; border-radius: 8px; padding: 20px; font-family: inherit; }
  </style>
</head>
<body>

  <!-- Print Button -->
  <button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF</button>

  <!-- COVER PAGE -->
  <div class="cover" style="position:relative">
    <div class="cover-badge">Brand Voice Guide</div>
    <div class="cover-name">${brand.name}</div>
    ${brand.name_ar ? `<div class="cover-name-ar">${brand.name_ar}</div>` : ''}
    ${brand.tagline ? `<div class="cover-tagline">"${brand.tagline}"</div>` : ''}
    <div class="cover-meta">
      ${brand.voice_archetype ? `<div class="cover-meta-item"><div class="cover-meta-label">Voice Archetype</div><div class="cover-meta-value">${brand.voice_archetype}</div></div>` : ''}
      ${brand.dialect ? `<div class="cover-meta-item"><div class="cover-meta-label">Dialect</div><div class="cover-meta-value">${brand.dialect}</div></div>` : ''}
      ${(brand.platforms || []).length ? `<div class="cover-meta-item"><div class="cover-meta-label">Platforms</div><div class="cover-meta-value">${brand.platforms.join(', ')}</div></div>` : ''}
    </div>
    <div class="cover-footer">
      <span class="cover-footer-text">Confidential — Internal Use Only</span>
      <span class="cover-footer-text">Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>
  </div>

  <!-- SECTION 1: Voice Fingerprint -->
  ${Object.keys(fingerprint).length > 0 ? `
  <section class="page-break">
    <div class="section-label">Section 01</div>
    <h2>Voice Fingerprint</h2>
    <p style="margin-bottom:28px;color:#6b7280">10 scored dimensions define the brand's communication DNA. Each scored 1–10 with evidence from real content.</p>
    <div style="columns:2;column-gap:40px">
      ${fingerprintRows}
    </div>
    ${brand.voice_fingerprint_json?.self_assessment ? `
    <div style="margin-top:32px;background:#fefce8;border:1px solid #fef08a;border-radius:8px;padding:20px">
      <h3 style="color:#854d0e;margin-bottom:12px">AI Confidence Assessment</h3>
      <p style="font-size:13px;color:#713f12">Overall confidence: <strong>${brand.voice_fingerprint_json.self_assessment.overall_confidence}/10</strong></p>
      ${(brand.voice_fingerprint_json.self_assessment.gaps || []).length ? `
      <p style="font-size:12px;color:#854d0e;margin-top:8px;font-weight:600">Data gaps identified:</p>
      <ul style="margin-top:4px;padding-left:16px">${(brand.voice_fingerprint_json.self_assessment.gaps || []).map(g => `<li style="font-size:12px;color:#713f12;line-height:1.6">${g}</li>`).join('')}</ul>` : ''}
    </div>` : ''}
  </section>` : ''}

  <!-- SECTION 2: Voice Rules -->
  ${programText ? `
  <section class="page-break">
    <div class="section-label">Section 02</div>
    <h2>Voice Rules & Brand Program</h2>
    <div class="program-text">${programText}</div>
  </section>` : ''}

  <!-- SECTION 3: Dialect Guide -->
  ${dialectExtractions.length > 0 ? `
  <section class="page-break">
    <div class="section-label">Section 03</div>
    <h2>Dialect Guide</h2>
    <p style="margin-bottom:20px;color:#6b7280">Key Tripoli Arabic expressions extracted from real brand content. Use these naturally — never forced.</p>
    <table>
      <thead>
        <tr>
          <th style="text-align:right">Arabic</th>
          <th>Translation</th>
          <th>Context / Usage</th>
          <th>Category</th>
        </tr>
      </thead>
      <tbody>${dialectRows}</tbody>
    </table>
  </section>` : ''}

  <!-- SECTION 4: Example Posts -->
  ${goldenPosts.length > 0 ? `
  <section class="page-break">
    <div class="section-label">Section 04</div>
    <h2>Golden Examples</h2>
    <p style="margin-bottom:20px;color:#6b7280">Approved posts that best represent the brand voice. Use as reference when writing new content.</p>
    ${postsHtml}
  </section>` : ''}

  <!-- SECTION 5: What NOT to Do -->
  ${negativeExamples.length > 0 ? `
  <section class="page-break">
    <div class="section-label">Section 05</div>
    <h2>What NOT to Sound Like</h2>
    <p style="margin-bottom:20px;color:#6b7280">Content that was explicitly rejected. Understanding what fails is as important as knowing what works.</p>
    ${negativesHtml}
  </section>` : ''}

  <!-- SECTION 6: Quick Reference -->
  <section class="page-break">
    <div class="section-label">Section 06</div>
    <h2>Quick Reference Card</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:8px">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px">
        <h3 style="color:#166534;margin-bottom:12px">✅ Always</h3>
        <ul style="padding-left:16px;space-y:4px">
          <li style="font-size:13px;line-height:1.8;color:#15803d">Write like a person, not a brand</li>
          <li style="font-size:13px;line-height:1.8;color:#15803d">Use Tripoli dialect naturally</li>
          <li style="font-size:13px;line-height:1.8;color:#15803d">Lead with a strong hook</li>
          <li style="font-size:13px;line-height:1.8;color:#15803d">Make CTAs feel like punchlines</li>
          <li style="font-size:13px;line-height:1.8;color:#15803d">Own the chaos — that's the brand</li>
        </ul>
      </div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px">
        <h3 style="color:#991b1b;margin-bottom:12px">❌ Never</h3>
        <ul style="padding-left:16px">
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Use wellness/lifestyle speak</li>
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Sound formal or corporate</li>
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Force Arabic where EN flows better</li>
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Explain the joke</li>
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Post without a hook</li>
        </ul>
      </div>
    </div>
    ${(brand.voice_inspirations || []).length ? `
    <div style="margin-top:24px">
      <h3>Voice Inspirations</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${(brand.voice_inspirations || []).map(v => `<span class="tag">${v}</span>`).join('')}</div>
    </div>` : ''}
    <div style="margin-top:48px;padding-top:24px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;color:#9ca3af">© ${new Date().getFullYear()} ${brand.name} — Confidential</span>
      <span style="font-size:12px;color:#9ca3af">Generated by Noch Brand Engine</span>
    </div>
  </section>

  <script>
    // Auto-open print dialog after a short delay
    setTimeout(() => window.print(), 800)
  </script>
</body>
</html>`

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
