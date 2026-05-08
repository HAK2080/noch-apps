import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Mic, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { getBusiness, updateBusiness } from '../services/businesses'
import { listVoiceProfiles, createVoiceProfile } from '../services/voiceProfiles'

export default function BusinessDetail() {
  const { businessId } = useParams()
  const [business, setBusiness] = useState(null)
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  async function refresh() {
    const [b, v] = await Promise.all([getBusiness(businessId), listVoiceProfiles(businessId)])
    setBusiness(b); setVoices(v); setLoading(false)
  }
  useEffect(() => { refresh().catch(e => { toast.error(e.message); setLoading(false) }) }, [businessId])

  async function addVoice(e) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await createVoiceProfile({
        business_id: businessId,
        name: newName.trim(),
        is_default: voices.length === 0,
      })
      setNewName('')
      setCreating(false)
      toast.success('Voice profile added')
      refresh()
    } catch (err) { toast.error(err.message) }
  }

  async function rename(name) {
    try { await updateBusiness(businessId, { name }); toast.success('Saved') } catch (e) { toast.error(e.message) }
  }

  if (loading) return <p className="text-noch-muted text-sm">Loading…</p>
  if (!business) return <p className="text-noch-muted text-sm">Not found</p>

  return (
    <div className="space-y-6">
      <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
        <h2 className="text-noch-muted text-xs uppercase tracking-wide mb-2">Business</h2>
        <input
          defaultValue={business.name}
          onBlur={e => e.target.value !== business.name && rename(e.target.value)}
          className="w-full bg-transparent text-white text-xl font-bold focus:outline-none"
        />
        {business.description && <p className="text-noch-muted text-sm mt-2">{business.description}</p>}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">Brand voice profiles</h3>
          {!creating && (
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-sm hover:opacity-90">
              <Plus size={16} /> Add voice profile
            </button>
          )}
        </div>

        {creating && (
          <form onSubmit={addVoice} className="bg-noch-card border border-noch-border rounded-xl p-3 mb-3 flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Voice profile name (e.g. Playful Notchi)"
              className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green"
            />
            <button className="px-3 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm">Save</button>
            <button type="button" onClick={() => { setCreating(false); setNewName('') }} className="px-3 py-2 rounded-lg text-noch-muted hover:text-white text-sm">Cancel</button>
          </form>
        )}

        {voices.length === 0 ? (
          <p className="text-noch-muted text-sm bg-noch-card border border-dashed border-noch-border rounded-xl p-6 text-center">
            No voice profiles yet. Add one to define tone, dialect, and language for this business.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {voices.map(v => (
              <Link key={v.id} to={`/content-studio/voice-lab?voice=${v.id}`} className="bg-noch-card border border-noch-border hover:border-noch-green/40 rounded-xl p-4 transition-colors">
                <div className="flex items-center gap-2">
                  <Mic size={14} className="text-noch-green" />
                  <span className="text-white font-medium">{v.name}</span>
                  {v.is_default && <span className="text-noch-green/70 text-xs">default</span>}
                </div>
                <p className="text-noch-muted text-xs mt-1">{v.language || 'en'} · {v.dialect || 'no dialect'} · formality {v.formality}/5 · humor {v.humor_tolerance}/5</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
