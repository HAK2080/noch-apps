import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Plus, Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  draft:     'bg-noch-border text-noch-muted',
  running:   'bg-noch-green/20 text-noch-green',
  completed: 'bg-blue-400/20 text-blue-400',
  discarded: 'bg-white/5 text-white/30',
}

const CATEGORIES = ['menu', 'pricing', 'marketing', 'operations', 'experience', 'other']

async function listExperiments() {
  const { data, error } = await supabase
    .from('experiments')
    .select('*, creator:profiles!created_by(full_name)')
    .order('created_at', { ascending: false })
  if (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return data || []
}

async function createExperiment(fields) {
  const { data, error } = await supabase
    .from('experiments')
    .insert(fields)
    .select()
    .single()
  if (error) throw error
  return data
}

export default function Experiments() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner' || profile?.role === 'supervisor'
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listExperiments()
      setExperiments(rows)
    } catch (e) {
      toast.error(e.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = experiments.filter(e => !statusFilter || e.status === statusFilter)

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-noch-green/10 text-noch-green flex items-center justify-center">
              <FlaskConical size={20} />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl">Experiments</h1>
              <p className="text-noch-muted text-sm">{experiments.length} total</p>
            </div>
          </div>
          {isOwner && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-sm"
            >
              <Plus size={14} /> New experiment
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1 rounded-lg text-sm border transition-colors ${!statusFilter ? 'bg-noch-green text-noch-dark border-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}
          >
            All
          </button>
          {['draft', 'running', 'completed', 'discarded'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-sm border transition-colors capitalize ${statusFilter === s ? 'bg-noch-green text-noch-dark border-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-noch-muted">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-noch-card border border-noch-border rounded-2xl p-10 text-center">
            <FlaskConical size={32} className="text-noch-muted mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">No experiments yet</p>
            <p className="text-noch-muted text-sm">Test menu changes, pricing tweaks, and new ideas systematically.</p>
          </div>
        ) : (
          <div className="bg-noch-card border border-noch-border rounded-2xl overflow-hidden">
            <div className="divide-y divide-noch-border">
              {filtered.map(exp => (
                <Link
                  key={exp.id}
                  to={`/experiments/${exp.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-noch-card-hover transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{exp.title}</p>
                    <p className="text-noch-muted text-xs mt-0.5">
                      {exp.category && <span className="mr-2 capitalize">{exp.category}</span>}
                      {exp.creator?.full_name && <span className="mr-2">{exp.creator.full_name}</span>}
                      {new Date(exp.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_COLORS[exp.status] || STATUS_COLORS.draft}`}>
                    {exp.status}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateExperimentModal
          profile={profile}
          onCreated={async (exp) => { setExperiments(prev => [exp, ...prev]); setShowCreate(false) }}
          onClose={() => setShowCreate(false)}
          createExperiment={createExperiment}
        />
      )}
    </Layout>
  )
}

function CreateExperimentModal({ profile, onCreated, onClose, createExperiment }) {
  const [title, setTitle] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [category, setCategory] = useState('')
  const [successMetric, setSuccessMetric] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const exp = await createExperiment({
        title: title.trim(),
        hypothesis: hypothesis.trim() || null,
        category: category || null,
        success_metric: successMetric.trim() || null,
        status: 'draft',
        created_by: profile.id,
      })
      onCreated(exp)
    } catch (e) {
      toast.error(e.message || 'Failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-4">
          <h2 className="text-white font-semibold">New experiment</h2>
          <div>
            <label className="text-noch-muted text-xs mb-1 block">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What are you testing?"
              className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50"
              autoFocus
            />
          </div>
          <div>
            <label className="text-noch-muted text-xs mb-1 block">Hypothesis</label>
            <textarea
              value={hypothesis}
              onChange={e => setHypothesis(e.target.value)}
              rows={2}
              placeholder="If we do X, we expect Y because Z"
              className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-noch-muted text-xs mb-1 block">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="">— Pick —</option>
                {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-noch-muted text-xs mb-1 block">Success metric</label>
              <input
                value={successMetric}
                onChange={e => setSuccessMetric(e.target.value)}
                placeholder="e.g. +10% orders"
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50"
              />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-noch-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-noch-muted hover:text-white text-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
