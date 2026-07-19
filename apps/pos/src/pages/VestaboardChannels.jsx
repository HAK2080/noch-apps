import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Play, Plus, Radio, Save, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const TYPES = ['weather', 'quote', 'trivia', 'sales', 'loyalty', 'special', 'custom']

export default function VestaboardChannels() {
  const navigate = useNavigate()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('vestaboard_channels').select('*').order('priority', { ascending: false })
    if (error) toast.error(error.message)
    setChannels(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const patchChannel = (id, updates) => setChannels(rows => rows.map(row => row.id === id ? { ...row, ...updates } : row))

  const save = async channel => {
    const { id } = channel
    const payload = { ...channel }
    delete payload.id
    delete payload.created_at
    const { error } = await supabase.from('vestaboard_channels').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Channel saved')
    load()
  }

  const add = async () => {
    const { error } = await supabase.from('vestaboard_channels').insert({ name: `Custom ${channels.length + 1}`, channel_type: 'custom', enabled: false, config: { message: 'WELCOME TO NOCH' } })
    if (error) return toast.error(error.message)
    load()
  }

  const remove = async id => {
    if (!confirm('Delete this channel?')) return
    const { error } = await supabase.from('vestaboard_channels').delete().eq('id', id)
    if (error) return toast.error(error.message)
    load()
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const { data, error } = await supabase.functions.invoke('vestaboard-cron', { body: {} })
      if (error) throw error
      toast.success(data?.channel ? `Queued ${data.channel}` : 'No channel is due')
      load()
    } catch (error) { toast.error(error.message) }
    finally { setRunning(false) }
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/vestaboard')} className="btn-secondary p-2"><ArrowLeft size={16} /></button>
          <Radio className="text-noch-green" />
          <div className="flex-1"><h1 className="text-white text-xl font-bold">Noch Channels</h1><p className="text-noch-muted text-sm">Free automated Vestaboard playlist</p></div>
          <button onClick={runNow} disabled={running} className="btn-secondary flex items-center gap-2">{running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run due channel</button>
          <button onClick={add} className="btn-primary flex items-center gap-2"><Plus size={14} /> Add</button>
        </div>

        {loading ? <Loader2 className="animate-spin text-noch-green mx-auto" /> : (
          <div className="space-y-3">
            {channels.map(channel => (
              <div key={channel.id} className="card grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <label className="md:col-span-2 text-xs text-noch-muted">Name<input className="input mt-1 w-full" value={channel.name} onChange={e => patchChannel(channel.id, { name: e.target.value })} /></label>
                <label className="md:col-span-2 text-xs text-noch-muted">Type<select className="input mt-1 w-full" value={channel.channel_type} onChange={e => patchChannel(channel.id, { channel_type: e.target.value })}>{TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
                <label className="text-xs text-noch-muted">Cadence<input type="number" min="15" className="input mt-1 w-full" value={channel.cadence_minutes} onChange={e => patchChannel(channel.id, { cadence_minutes: Number(e.target.value) })} /></label>
                <label className="text-xs text-noch-muted">Start<input type="number" min="0" max="23" className="input mt-1 w-full" value={channel.start_hour} onChange={e => patchChannel(channel.id, { start_hour: Number(e.target.value) })} /></label>
                <label className="text-xs text-noch-muted">End<input type="number" min="0" max="23" className="input mt-1 w-full" value={channel.end_hour} onChange={e => patchChannel(channel.id, { end_hour: Number(e.target.value) })} /></label>
                <label className="text-xs text-noch-muted">Priority<input type="number" className="input mt-1 w-full" value={channel.priority} onChange={e => patchChannel(channel.id, { priority: Number(e.target.value) })} /></label>
                <label className="md:col-span-2 text-xs text-noch-muted">Message / config<input className="input mt-1 w-full" value={channel.config?.message || ''} onChange={e => patchChannel(channel.id, { config: { ...channel.config, message: e.target.value } })} disabled={!['custom', 'special'].includes(channel.channel_type)} /></label>
                <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={channel.enabled} onChange={e => patchChannel(channel.id, { enabled: e.target.checked })} /> Active</label>
                <div className="flex gap-2"><button onClick={() => save(channel)} className="btn-primary p-2"><Save size={14} /></button><button onClick={() => remove(channel.id)} className="btn-secondary p-2 text-red-300"><Trash2 size={14} /></button></div>
                <p className="md:col-span-12 text-[10px] text-noch-muted">Next: {channel.next_run_at ? new Date(channel.next_run_at).toLocaleString() : 'when enabled'} · Last: {channel.last_enqueued_at ? new Date(channel.last_enqueued_at).toLocaleString() : 'never'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
