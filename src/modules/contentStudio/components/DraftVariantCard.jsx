import { useEffect, useState } from 'react'
import { Sparkles, Check, X, Save, Loader2, History, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import EvaluatorBadge from './EvaluatorBadge'
import { evaluateDraft } from '../ai/evaluateDraft'
import { humanizeDraft } from '../ai/humanizeDraft'
import { createDraft, updateDraftStatus } from '../services/drafts'
import { createEvaluation, latestEvaluation } from '../services/evaluations'
import { recordEdit } from '../services/edits'
import { recordSignal } from '../services/learningSignals'
import { approveDraftToBank } from '../services/contentBank'
import { lineDiff } from '../lib/diff'
import { classifyEdit } from '../lib/classifyEdit'
import { REWRITE_ACTIONS } from '../lib/constants'

export default function DraftVariantCard({ draft, voiceProfile, onChanged }) {
  const [body, setBody] = useState(draft.body_text || '')
  const [evaluation, setEvaluation] = useState(null)
  const [loadingEval, setLoadingEval] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rewriteAction, setRewriteAction] = useState('')
  const [rewriting, setRewriting] = useState(false)

  useEffect(() => { setBody(draft.body_text || '') }, [draft.id, draft.body_text])

  useEffect(() => {
    let cancelled = false
    setLoadingEval(true)
    latestEvaluation(draft.id)
      .then(e => { if (!cancelled) setEvaluation(e) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingEval(false) })
    return () => { cancelled = true }
  }, [draft.id])

  const dirty = body !== draft.body_text

  async function handleEvaluate() {
    setEvaluating(true)
    try {
      const result = await evaluateDraft({ draft, voiceProfile })
      const row = await createEvaluation({
        draft_id: draft.id,
        scores: result.scores || {},
        labels: result.labels || [],
        explanations: result.explanations || {},
        evaluator_version: result.evaluator_version || 'v1',
        ai_model: result.ai_model || null,
      })
      setEvaluation(row)
      toast.success('Evaluated')
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Evaluate failed')
    } finally {
      setEvaluating(false)
    }
  }

  async function handleSaveEdit() {
    if (!dirty) return
    setSaving(true)
    try {
      const newDraft = await createDraft({
        concept_id: draft.concept_id,
        brand_voice_profile_id: draft.brand_voice_profile_id,
        platform: draft.platform,
        format: draft.format,
        body_text: body,
        hook: draft.hook,
        cta: draft.cta,
        hashtags: draft.hashtags || [],
        generation_params: draft.generation_params || {},
        parent_draft_id: draft.id,
        source: 'human',
        status: 'edited',
      })
      const before = draft.body_text || ''
      const after = body
      const classification = classifyEdit(before, after)
      await recordEdit({
        draft_id: newDraft.id,
        before_text: before,
        after_text: after,
        diff: lineDiff(before, after),
        classification,
      })
      recordSignal({
        business_id: voiceProfile?.business_id || null,
        brand_voice_profile_id: draft.brand_voice_profile_id,
        signal_type: 'edit',
        source_table: 'cs_draft_variants',
        source_id: newDraft.id,
        payload: { classification, parent_draft_id: draft.id },
      }).catch(() => {})
      toast.success('Edit saved as new version')
      onChanged?.(newDraft)
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatus(status) {
    try {
      const row = await updateDraftStatus(draft.id, status)
      if (status === 'approved' && voiceProfile?.business_id) {
        try {
          await approveDraftToBank({
            business_id: voiceProfile.business_id,
            brand_voice_profile_id: draft.brand_voice_profile_id,
            draft_id: draft.id,
            concept_id: draft.concept_id,
            inspiration_id: draft.inspiration_id || null,
            format: draft.format,
            platform: draft.platform,
            content_pillar: draft.content_pillar || null,
            seasonality: draft.seasonality || null,
            final_text: draft.body_text,
            hashtags: draft.hashtags || [],
            tags: [],
            status: 'approved',
          })
        } catch (snapErr) {
          console.error('Bank snapshot failed', snapErr)
          toast.error('Approved, but bank snapshot failed')
        }
      }
      toast.success(status === 'approved' ? 'Approved & banked' : 'Rejected')
      recordSignal({
        business_id: voiceProfile?.business_id || null,
        brand_voice_profile_id: draft.brand_voice_profile_id,
        signal_type: status,
        source_table: 'cs_draft_variants',
        source_id: draft.id,
        payload: { platform: draft.platform, format: draft.format },
      }).catch(() => {})
      onChanged?.(row)
    } catch (e) {
      toast.error(e.message || 'Failed')
    }
  }

  async function handleRewrite() {
    if (!rewriteAction) return toast.error('Pick an action')
    setRewriting(true)
    try {
      const result = await humanizeDraft({ draft, action: rewriteAction, voiceProfile })
      const r = result?.rewritten || {}
      const newDraft = await createDraft({
        concept_id: draft.concept_id,
        brand_voice_profile_id: draft.brand_voice_profile_id,
        platform: draft.platform,
        format: draft.format,
        body_text: r.body || '',
        hook: r.hook || null,
        cta: r.cta || null,
        hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
        generation_params: { action: rewriteAction, ai_model: result?.ai_model },
        parent_draft_id: draft.id,
        source: 'rewrite',
        status: 'generated',
      })
      recordSignal({
        business_id: voiceProfile?.business_id || null,
        brand_voice_profile_id: draft.brand_voice_profile_id,
        signal_type: 'rewrite',
        source_table: 'cs_draft_variants',
        source_id: newDraft.id,
        payload: { action: rewriteAction, parent_draft_id: draft.id },
      }).catch(() => {})
      toast.success(`Rewrote: ${rewriteAction}`)
      setRewriteAction('')
      onChanged?.(newDraft)
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Rewrite failed')
    } finally {
      setRewriting(false)
    }
  }

  return (
    <div className="bg-noch-card border border-noch-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-noch-muted text-xs">
          <span className="capitalize">{draft.format?.replace('_', ' ')}</span>
          {draft.platform && <span>· {draft.platform}</span>}
          {draft.parent_draft_id && (
            <span className="inline-flex items-center gap-1"><History size={10} /> v{shortId(draft.id)}</span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-noch-border capitalize">{draft.status}</span>
        </div>
        <div className="flex items-center gap-1">
          {evaluation?.labels?.map(l => <EvaluatorBadge key={l} label={l} />)}
          {loadingEval && <Loader2 size={12} className="text-noch-muted animate-spin" />}
        </div>
      </div>

      <textarea
        rows={5}
        value={body}
        onChange={e => setBody(e.target.value)}
        className="w-full bg-noch-dark border border-noch-border rounded-lg p-2 text-white text-sm focus:outline-none focus:border-noch-green"
      />

      {(draft.hook || draft.cta || draft.hashtags?.length > 0) && (
        <div className="mt-2 space-y-1 text-xs">
          {draft.hook && <p className="text-noch-muted"><span className="text-noch-muted/60">Hook:</span> {draft.hook}</p>}
          {draft.cta && <p className="text-noch-muted"><span className="text-noch-muted/60">CTA:</span> {draft.cta}</p>}
          {draft.hashtags?.length > 0 && (
            <p className="text-noch-green/80">{draft.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
          )}
        </div>
      )}

      {evaluation?.scores && Object.keys(evaluation.scores).length > 0 && (
        <details className="mt-2">
          <summary className="text-noch-muted text-xs cursor-pointer">Scores</summary>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-noch-muted">
            {Object.entries(evaluation.scores).map(([k, v]) => (
              <div key={k}><span className="text-noch-muted/60">{k}:</span> {v}</div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-3 flex items-center gap-1.5 flex-wrap bg-noch-dark border border-noch-border rounded-md p-1.5">
        <Wand2 size={12} className="text-noch-muted ml-1" />
        <select
          value={rewriteAction}
          onChange={e => setRewriteAction(e.target.value)}
          className="flex-1 bg-transparent text-white text-xs focus:outline-none"
        >
          <option value="">Rewrite action…</option>
          {REWRITE_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <button
          onClick={handleRewrite}
          disabled={!rewriteAction || rewriting}
          className="px-2.5 py-1 rounded-md bg-noch-green/20 text-noch-green text-xs font-medium disabled:opacity-40"
        >
          {rewriting ? <Loader2 size={12} className="animate-spin" /> : 'Rewrite'}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          onClick={handleSaveEdit}
          disabled={!dirty || saving}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-noch-green text-noch-dark text-xs font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save edit
        </button>
        <button
          onClick={handleEvaluate}
          disabled={evaluating}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-noch-border text-noch-muted hover:text-white text-xs disabled:opacity-50"
        >
          {evaluating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Evaluate
        </button>
        <div className="flex-1" />
        <button onClick={() => handleStatus('approved')} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-green-400 hover:bg-green-500/10 text-xs">
          <Check size={12} /> Approve
        </button>
        <button onClick={() => handleStatus('rejected')} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-red-400 hover:bg-red-500/10 text-xs">
          <X size={12} /> Reject
        </button>
      </div>
    </div>
  )
}

function shortId(id) { return String(id).slice(0, 6) }
