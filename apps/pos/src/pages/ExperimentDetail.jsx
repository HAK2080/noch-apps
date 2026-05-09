import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Save, Trash2, FlaskConical } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const STATUS_OPTIONS = ['draft', 'running', 'completed', 'discarded']
const CATEGORIES = ['menu', 'pricing', 'marketing', 'operations', 'experience', 'other']

export default function ExperimentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner' || profile?.role === 'supervisor'

  const [exp, setExp] = useState(null)
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('experiments')
        .select('*, creator:profiles!created_by(full_name)')
        .eq('id', id)
        .single()
      if (error) throw error
      setExp(data)
      setForm({
        title: data.title || '',
        hypothesis: data.hypothesis || '',
        category: data.category || '',
        success_metric: data.success_metric || '',
        result: data.result || '',
        result_notes: data.result_notes || '',
        started_at: data.started_at || '',
        ended_at: data.ended_at || '',
        status: data.status || 'draft',
      })
    } catch (e) {
      toast.error(e.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('experiments')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      setExp(data)
      toast.success('Saved')
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this experiment?')) return
    try {
      const { error } = await supabase.from('experiments').delete().eq('id', id)
      if (error) throw error
      toast.success('Deleted')
      navigate('/experiments')
    } catch (e) {
      toast.error(e.message || 'Delete failed')
    }
  }

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  if (loading) return <Layout><div className="text-noch-muted text-sm p-6">Loading…</div></Layout>
  if (!exp) return <Layout><div className="text-noch-muted text-sm p-6">Not found</div></Layout>

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
          <button
            onClick={() => navigate('/experiments')}
            className="flex items-center gap-1.5 text-noch-muted hover:text-white text-sm"
          >
            <ArrowLeft size={14} /> Back to experiments
          </button>
          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 text-noch-muted hover:text-red-400 text-sm"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main */}
          <div className="lg:col-span-2 space-y-4">
            <section className="bg-noch-card border border-noch-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical size={16} className="text-noch-green" />
                <h2 className="text-white font-semibold">Experiment</h2>
              </div>

              <div>
                <label className="text-noch-muted text-xs mb-1 block">Title</label>
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>

              <div>
                <label className="text-noch-muted text-xs mb-1 block">Hypothesis</label>
                <textarea
                  value={form.hypothesis}
                  onChange={e => set('hypothesis', e.target.value)}
                  rows={3}
                  placeholder="If we do X, we expect Y because Z"
                  className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm resize-none"
                />
              </div>

              <div>
                <label className="text-noch-muted text-xs mb-1 block">Success metric</label>
                <input
                  value={form.success_metric}
                  onChange={e => set('success_metric', e.target.value)}
                  placeholder="e.g. +10% orders on item X"
                  className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
            </section>

            <section className="bg-noch-card border border-noch-border rounded-2xl p-5 space-y-4">
              <h2 className="text-white font-semibold">Results</h2>
              <div>
                <label className="text-noch-muted text-xs mb-1 block">Outcome</label>
                <div className="flex gap-2">
                  {['success', 'failure', 'inconclusive'].map(r => (
                    <button
                      key={r}
                      onClick={() => set('result', r)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border capitalize transition-colors ${
                        form.result === r
                          ? r === 'success' ? 'border-noch-green bg-noch-green/20 text-noch-green'
                            : r === 'failure' ? 'border-red-400 bg-red-400/20 text-red-400'
                            : 'border-amber-400 bg-amber-400/20 text-amber-400'
                          : 'border-noch-border text-noch-muted hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-noch-muted text-xs mb-1 block">Result notes</label>
                <textarea
                  value={form.result_notes}
                  onChange={e => set('result_notes', e.target.value)}
                  rows={3}
                  placeholder="What did you observe? What would you do differently?"
                  className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm resize-none"
                />
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <section className="bg-noch-card border border-noch-border rounded-2xl p-5 space-y-3">
              <h2 className="text-white font-semibold text-sm">Details</h2>

              <div>
                <label className="text-noch-muted text-xs mb-1 block">Status</label>
                <select
                  value={form.status}
                  onChange={e => set('status', e.target.value)}
                  className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-noch-muted text-xs mb-1 block">Category</label>
                <select
                  value={form.category}
                  onChange={e => set('category', e.target.value)}
                  className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="">— Pick —</option>
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-noch-muted text-xs mb-1 block">Start date</label>
                <input
                  type="date"
                  value={form.started_at}
                  onChange={e => set('started_at', e.target.value)}
                  className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>

              <div>
                <label className="text-noch-muted text-xs mb-1 block">End date</label>
                <input
                  type="date"
                  value={form.ended_at}
                  onChange={e => set('ended_at', e.target.value)}
                  className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>

              {exp.creator?.full_name && (
                <p className="text-noch-muted text-xs">By {exp.creator.full_name}</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </Layout>
  )
}
