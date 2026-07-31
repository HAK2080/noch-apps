import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, RefreshCw, Target, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Layout from '../../../components/Layout'
import { useAuth } from '../../../contexts/AuthContext'
import { supabase } from '../../../lib/supabase'

const localDateTime = (offsetDays) => {
  const value = new Date(Date.now() + offsetDays * 86400000)
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
  return value.toISOString().slice(0, 16)
}

const initialForm = {
  title: '',
  description: '',
  mission_type: 'repeat_visit',
  target_count: 2,
  reward_points: 50,
  starts_at: localDateTime(0),
  ends_at: localDateTime(7),
  max_completions: 1,
  branch_ids: [],
  product_ids: [],
  category_ids: [],
  quiet_start: '14:00',
  quiet_end: '17:00',
  status: 'draft',
}

const selectedValues = event => Array.from(event.target.selectedOptions, option => option.value)

export default function LoyaltyMissionsV2() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [missions, setMissions] = useState([])
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [missionResult, branchResult, productResult, categoryResult] = await Promise.all([
      supabase.from('loyalty_v2_missions').select('*').order('created_at', { ascending: false }),
      supabase.from('pos_branches').select('id,name').eq('is_active', true).order('name'),
      supabase.from('pos_products').select('id,name,category_id').eq('is_active', true).order('name'),
      supabase.from('pos_categories').select('id,name').order('name'),
    ])
    const error = missionResult.error || branchResult.error || productResult.error || categoryResult.error
    if (error) toast.error(error.message)
    setMissions(missionResult.data || [])
    setBranches(branchResult.data || [])
    setProducts(productResult.data || [])
    setCategories(categoryResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const resetForm = () => {
    setForm({ ...initialForm, starts_at: localDateTime(0), ends_at: localDateTime(7) })
    setEditingId(null)
    setShowForm(false)
  }

  const editMission = mission => {
    if (mission.status === 'active') {
      toast.error('Suspend an active mission before editing its rules')
      return
    }
    setEditingId(mission.id)
    setForm({
      ...initialForm,
      ...mission,
      starts_at: mission.starts_at?.slice(0, 16),
      ends_at: mission.ends_at?.slice(0, 16),
      branch_ids: mission.branch_ids || [],
      product_ids: mission.product_ids || [],
      category_ids: mission.category_ids || [],
    })
    setShowForm(true)
  }

  const save = async event => {
    event.preventDefault()
    if (!form.title.trim()) return
    if (new Date(form.ends_at) <= new Date(form.starts_at)) {
      toast.error('Mission expiry must be after its start')
      return
    }
    setSaving(true)
    const payload = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim() || null,
      target_count: Number(form.target_count),
      reward_points: Number(form.reward_points),
      max_completions: Number(form.max_completions),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      quiet_start: form.mission_type === 'quiet_hours' ? form.quiet_start : null,
      quiet_end: form.mission_type === 'quiet_hours' ? form.quiet_end : null,
    }
    let result
    if (editingId) {
      result = await supabase.rpc('create_loyalty_mission_version_v2', {
        p_mission_id: editingId,
        p_title: payload.title,
        p_description: payload.description,
        p_mission_type: payload.mission_type,
        p_target_count: payload.target_count,
        p_reward_points: payload.reward_points,
        p_starts_at: payload.starts_at,
        p_ends_at: payload.ends_at,
        p_max_completions: payload.max_completions,
        p_branch_ids: payload.branch_ids,
        p_product_ids: payload.product_ids,
        p_category_ids: payload.category_ids,
        p_quiet_start: payload.quiet_start,
        p_quiet_end: payload.quiet_end,
        p_status: 'draft',
      })
    } else {
      const code = `${form.mission_type}-${Date.now()}`
      result = await supabase.from('loyalty_v2_missions').insert({
        ...payload,
        code,
        version: 1,
        created_by: profile?.id || null,
      })
    }
    setSaving(false)
    if (result.error) {
      toast.error(result.error.message)
      return
    }
    toast.success(editingId ? 'New mission version created' : 'Mission created')
    resetForm()
    load()
  }

  const setStatus = async (mission, status) => {
    if (status === 'active') {
      const activeCount = missions.filter(item => (
        item.status === 'active'
        && new Date(item.starts_at) <= new Date()
        && new Date(item.ends_at) >= new Date()
      )).length
      if (activeCount >= 2 && mission.status !== 'active') {
        toast.error('Only two live missions can be active at once')
        return
      }
    }
    const { error } = await supabase
      .from('loyalty_v2_missions')
      .update({ status })
      .eq('id', mission.id)
    if (error) toast.error(error.message)
    else {
      toast.success(status === 'active' ? 'Mission activated' : 'Mission suspended')
      load()
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button className="btn-secondary p-2.5" onClick={() => navigate('/loyalty')}><ArrowLeft size={17} /></button>
          <div>
            <h1 className="text-xl font-bold text-white">V2 missions</h1>
            <p className="mt-1 text-sm text-noch-muted">Create simple, paid-order missions; customers see at most two</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary p-2.5" onClick={load}><RefreshCw size={16} /></button>
          <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingId(null); setForm(initialForm); setShowForm(true) }}>
            <Plus size={16} /> New mission
          </button>
        </div>
      </div>

      {showForm && (
        <form className="card mb-6 space-y-4" onSubmit={save}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{editingId ? 'Edit mission' : 'Create mission'}</h2>
            <button type="button" className="text-noch-muted hover:text-white" onClick={resetForm}><X size={17} /></button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="label">Title<input className="input mt-1 w-full" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required /></label>
            <label className="label">Mission type
              <select className="input mt-1 w-full" value={form.mission_type} onChange={event => setForm({ ...form, mission_type: event.target.value })}>
                <option value="repeat_visit">Repeat visit</option>
                <option value="selected_product">Selected product</option>
                <option value="selected_category">Selected category</option>
                <option value="quiet_hours">Quiet hours</option>
              </select>
            </label>
            <label className="label md:col-span-2">Customer task<input className="input mt-1 w-full" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
            <label className="label">Progress target<input className="input mt-1 w-full" type="number" min="1" value={form.target_count} onChange={event => setForm({ ...form, target_count: event.target.value })} /></label>
            <label className="label">Bonus points<input className="input mt-1 w-full" type="number" min="1" value={form.reward_points} onChange={event => setForm({ ...form, reward_points: event.target.value })} /></label>
            <label className="label">Starts<input className="input mt-1 w-full" type="datetime-local" value={form.starts_at} onChange={event => setForm({ ...form, starts_at: event.target.value })} /></label>
            <label className="label">Expires<input className="input mt-1 w-full" type="datetime-local" value={form.ends_at} onChange={event => setForm({ ...form, ends_at: event.target.value })} /></label>
            <label className="label">Completion limit<input className="input mt-1 w-full" type="number" min="1" value={form.max_completions} onChange={event => setForm({ ...form, max_completions: event.target.value })} /></label>
            <label className="label">Locations
              <select multiple className="input mt-1 h-24 w-full" value={form.branch_ids} onChange={event => setForm({ ...form, branch_ids: selectedValues(event) })}>
                {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            {form.mission_type === 'selected_product' && (
              <label className="label md:col-span-2">Eligible products
                <select multiple className="input mt-1 h-32 w-full" value={form.product_ids} onChange={event => setForm({ ...form, product_ids: selectedValues(event) })}>
                  {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
            )}
            {form.mission_type === 'selected_category' && (
              <label className="label md:col-span-2">Eligible categories
                <select multiple className="input mt-1 h-28 w-full" value={form.category_ids} onChange={event => setForm({ ...form, category_ids: selectedValues(event) })}>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            )}
            {form.mission_type === 'quiet_hours' && (
              <>
                <label className="label">From<input className="input mt-1 w-full" type="time" value={form.quiet_start} onChange={event => setForm({ ...form, quiet_start: event.target.value })} /></label>
                <label className="label">Until<input className="input mt-1 w-full" type="time" value={form.quiet_end} onChange={event => setForm({ ...form, quiet_end: event.target.value })} /></label>
              </>
            )}
          </div>
          <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save mission'}</button>
        </form>
      )}

      {loading ? (
        <p className="py-16 text-center text-noch-muted">Loading missions…</p>
      ) : (
        <div className="space-y-3">
          {missions.map(mission => (
            <div key={mission.id} className="card flex flex-wrap items-center gap-3">
              <Target size={18} className={mission.status === 'active' ? 'text-noch-green' : 'text-noch-muted'} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{mission.title}</p>
                <p className="text-xs text-noch-muted">
                  {mission.mission_type.replaceAll('_', ' ')} · {mission.target_count} target · {mission.reward_points} points · v{mission.version}
                </p>
              </div>
              <span className={mission.status === 'active' ? 'text-xs font-semibold text-noch-green' : 'text-xs font-semibold text-noch-muted'}>
                {mission.status}
              </span>
              <button className="btn-secondary text-sm" onClick={() => editMission(mission)}>Edit</button>
              <button className="btn-secondary text-sm" onClick={() => setStatus(mission, mission.status === 'active' ? 'suspended' : 'active')}>
                {mission.status === 'active' ? 'Suspend' : 'Activate'}
              </button>
            </div>
          ))}
          {missions.length === 0 && <div className="card py-12 text-center text-noch-muted">No V2 missions yet</div>}
        </div>
      )}
    </Layout>
  )
}
