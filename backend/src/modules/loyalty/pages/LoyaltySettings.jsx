import { useState, useEffect } from 'react'
import { Save, MapPin, Gift, Sparkles, Star, Zap, Trash2, Plus, X, ToggleLeft, ToggleRight, Calendar, MessageSquare, Users, Trophy } from 'lucide-react'
import { getLoyaltySettings, updateLoyaltySettings } from '../../../lib/supabase'
import { getPOSBranches, updatePOSBranch } from '../../pos/lib/pos-supabase'
import { supabase } from '../../../lib/supabase'
import { useLanguage } from '../../../contexts/LanguageContext'
import Layout from '../../../components/Layout'
import NochiBunny from '../components/NochiBunny'
import toast from 'react-hot-toast'

const SKINS = [
  { id: 'default', label: 'Default', emoji: '🐰' },
  { id: 'ramadan', label: 'Ramadan', emoji: '🌙' },
  { id: 'eid', label: 'Eid', emoji: '✨' },
  { id: 'winter', label: 'Winter', emoji: '❄️' },
  { id: 'birthday', label: 'Birthday Mode', emoji: '🎂' },
]

function SpinPrizeManager() {
  const [prizes, setPrizes] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ emoji: '🎁', name: '', description: '', weight: 10, prize_type: 'item', is_active: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('loyalty_spin_prizes').select('*').order('weight', { ascending: false })
      .then(({ data }) => setPrizes(data || []))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('loyalty_spin_prizes').insert({ ...form, weight: parseInt(form.weight) || 10 }).select().single()
      if (error) throw error
      setPrizes(p => [...p, data])
      setForm({ emoji: '🎁', name: '', description: '', weight: 10, prize_type: 'item', is_active: true })
      setShowAdd(false)
      toast.success('Prize added')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const togglePrize = async (id, val) => {
    await supabase.from('loyalty_spin_prizes').update({ is_active: val }).eq('id', id)
    setPrizes(p => p.map(x => x.id === id ? { ...x, is_active: val } : x))
  }

  const deletePrize = async (id) => {
    if (!confirm('Delete prize?')) return
    await supabase.from('loyalty_spin_prizes').delete().eq('id', id)
    setPrizes(p => p.filter(x => x.id !== id))
    toast.success('Deleted')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-medium text-sm">Spin Prizes</p>
        <button onClick={() => setShowAdd(true)} className="text-xs text-noch-green hover:underline flex items-center gap-1"><Plus size={12} /> Add</button>
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        {prizes.map(p => (
          <div key={p.id} className={`flex items-center gap-2 p-2 rounded-xl border ${p.is_active ? 'border-noch-border' : 'border-noch-border/30 opacity-50'}`}>
            <span className="text-lg w-6">{p.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium">{p.name}</p>
              <p className="text-noch-muted text-[10px]">Weight: {p.weight}</p>
            </div>
            <button onClick={() => togglePrize(p.id, !p.is_active)} className={`text-xs px-2 py-0.5 rounded-lg border ${p.is_active ? 'text-noch-green border-noch-green/30' : 'text-noch-muted border-noch-border'}`}>
              {p.is_active ? 'On' : 'Off'}
            </button>
            <button onClick={() => deletePrize(p.id)} className="text-noch-muted hover:text-red-400 p-0.5">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="bg-noch-dark rounded-xl p-3 border border-noch-border">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input className="input text-sm py-1.5" value={form.emoji} onChange={e => set('emoji', e.target.value)} placeholder="Emoji" maxLength={2} />
            <input className="input text-sm py-1.5" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Prize name *" />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input type="number" className="input text-sm py-1.5" value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="Weight (1-100)" min={1} max={100} />
            <select className="input text-sm py-1.5" value={form.prize_type} onChange={e => set('prize_type', e.target.value)}>
              <option value="item">Item</option>
              <option value="discount">Discount</option>
              <option value="points">Points</option>
              <option value="nothing">Nothing</option>
            </select>
          </div>
          <input className="input text-sm py-1.5 w-full mb-2" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Description (optional)" />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-xs py-1.5 flex-1">Cancel</button>
            <button onClick={handleAdd} disabled={saving} className="btn-primary text-xs py-1.5 flex-1">{saving ? '...' : 'Add'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LoyaltySettings() {
  const { lang } = useLanguage()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [branches, setBranches] = useState([])
  const [branchUrls, setBranchUrls] = useState({})
  const [savingBranch, setSavingBranch] = useState(null)
  const ar = lang === 'ar'

  useEffect(() => {
    getLoyaltySettings()
      .then(data => { if (data) setSettings(data) })
      .catch(err => toast.error(err.message || 'Failed to load settings'))
      .finally(() => setLoading(false))

    getPOSBranches()
      .then(data => {
        setBranches(data || [])
        const urlMap = {}
        for (const b of data || []) urlMap[b.id] = b.google_maps_url || ''
        setBranchUrls(urlMap)
      })
      .catch(() => {})
  }, [])

  const handleSaveBranchUrl = async (branchId) => {
    setSavingBranch(branchId)
    try {
      await updatePOSBranch(branchId, { google_maps_url: branchUrls[branchId] || null })
      toast.success('Saved ✓')
    } catch (err) { toast.error(err.message) }
    finally { setSavingBranch(null) }
  }

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateLoyaltySettings(settings)
      toast.success('Saved ✓')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">...</p></Layout>

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-white font-bold text-xl">{ar ? 'إعدادات نوتشي' : 'Nochi Settings'}</h1>
          <button onClick={handleSave} disabled={saving || !settings} className="btn-primary flex items-center gap-2">
            <Save size={16} />
            {saving ? '...' : (ar ? 'حفظ الكل' : 'Save All')}
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Stamp system */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Star size={14} className="text-noch-green" /> Stamp System</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{ar ? 'عدد الطوابع للمكافأة' : 'Stamps for Reward'}</label>
                <input type="number" className="input" value={settings?.stamp_goal} onChange={e => set('stamp_goal', parseInt(e.target.value))} min={3} max={20} />
              </div>
              <div>
                <label className="label">{ar ? 'وصف المكافأة' : 'Reward Description'}</label>
                <input className="input" value={settings?.reward_description} onChange={e => set('reward_description', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Points system */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Zap size={14} className="text-yellow-400" /> Points System</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Points per Visit</label>
                <input type="number" className="input" value={settings?.points_per_visit || 10} onChange={e => set('points_per_visit', parseInt(e.target.value))} min={0} />
              </div>
              <div>
                <label className="label">Points Value (LYD per 100 pts)</label>
                <input type="number" className="input" value={settings?.points_value || 1} onChange={e => set('points_value', parseFloat(e.target.value))} step="0.1" min={0} />
              </div>
            </div>
          </div>

          {/* Spin wheel */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-sm flex items-center gap-2">🎡 Spin Wheel</h2>
              <button
                onClick={() => set('spin_enabled', !settings?.spin_enabled)}
                className={`px-3 py-1 text-xs rounded-lg border font-medium transition-colors ${settings?.spin_enabled ? 'bg-noch-green/10 text-noch-green border-noch-green/30' : 'border-noch-border text-noch-muted'}`}>
                {settings?.spin_enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            {settings?.spin_enabled && (
              <>
                <div className="mb-3">
                  <label className="label">Cost to Spin (points)</label>
                  <input type="number" className="input" value={settings?.spin_cost_points || 50} onChange={e => set('spin_cost_points', parseInt(e.target.value))} min={0} />
                </div>
                <SpinPrizeManager />
              </>
            )}
          </div>

          {/* Seasonal skin */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Sparkles size={14} className="text-purple-400" /> Seasonal Skin</h2>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {SKINS.map(s => (
                <button
                  key={s.id}
                  onClick={() => set('seasonal_skin', s.id)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    settings?.seasonal_skin === s.id
                      ? 'bg-noch-green/10 border-noch-green text-noch-green'
                      : 'border-noch-border text-noch-muted hover:text-white'
                  }`}
                >
                  <span className="text-xl">{s.emoji}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tier thresholds */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3">🏆 Tier Thresholds (lifetime stamps)</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'tier_silver_at', label: '🥈 Silver', color: 'text-slate-300' },
                { key: 'tier_gold_at', label: '🥇 Gold', color: 'text-yellow-400' },
                { key: 'tier_legend_at', label: '👑 Legend', color: 'text-purple-400' },
              ].map(t => (
                <div key={t.key}>
                  <label className={`label ${t.color}`}>{t.label}</label>
                  <input type="number" className="input" value={settings?.[t.key]} onChange={e => set(t.key, parseInt(e.target.value))} min={1} />
                </div>
              ))}
            </div>
          </div>

          {/* Nochi states */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-4">🐰 Nochi States (Days Inactive)</h2>
            <div className="flex flex-col gap-3">
              {[
                { key: 'inactivity_sad_days', state: 'sad', label: 'Sad after (days)' },
                { key: 'inactivity_tired_days', state: 'tired', label: 'Tired after (days)' },
                { key: 'inactivity_deathbed_days', state: 'deathbed', label: 'Deathbed after (days)' },
                { key: 'inactivity_dead_days', state: 'dead', label: 'Gone after (days)' },
              ].map(item => (
                <div key={item.key} className="flex items-center gap-3">
                  <NochiBunny state={item.state} size="sm" showLabel={false} />
                  <div className="flex-1">
                    <label className="label text-xs">{item.label}</label>
                    <input type="number" className="input" value={settings?.[item.key]} onChange={e => set(item.key, parseInt(e.target.value))} min={1} max={180} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Birthday & automation */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">🎂 Birthday & Automation</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Birthday Bonus Points</label>
                <input type="number" className="input" value={settings?.birthday_bonus_points || 50} onChange={e => set('birthday_bonus_points', parseInt(e.target.value))} min={0} />
              </div>
              <div>
                <label className="label">Win-back Offer (days inactive)</label>
                <input type="number" className="input" value={settings?.winback_after_days || 30} onChange={e => set('winback_after_days', parseInt(e.target.value))} min={1} />
              </div>
            </div>
          </div>

          {/* Feedback */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3">⭐ Feedback</h2>
            <div>
              <label className="label">{ar ? 'طلب التقييم بعد الزيارة (ساعات)' : 'Request feedback after visit (hours)'}</label>
              <input type="number" className="input" value={settings?.feedback_delay_hours} onChange={e => set('feedback_delay_hours', parseInt(e.target.value))} min={0} max={48} />
            </div>
          </div>

          {/* Referral */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3">🔗 Referral Program</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Referrer Bonus Points</label>
                <input type="number" className="input" value={settings?.referral_bonus_referrer || 30} onChange={e => set('referral_bonus_referrer', parseInt(e.target.value))} min={0} />
              </div>
              <div>
                <label className="label">Referee Bonus Points</label>
                <input type="number" className="input" value={settings?.referral_bonus_referee || 20} onChange={e => set('referral_bonus_referee', parseInt(e.target.value))} min={0} />
              </div>
            </div>
          </div>

          {/* Points & Rewards */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Zap size={14} className="text-yellow-400" /> Points & Rewards</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'points_per_visit', label: 'Points per Visit' },
                { key: 'points_per_reward', label: 'Points per Reward' },
                { key: 'points_for_google_review', label: 'Google Review Bonus' },
                { key: 'points_for_referral', label: 'Referral Bonus' },
                { key: 'points_for_story_share', label: 'Story Share Bonus' },
              ].map(f => (
                <div key={f.key}>
                  <label className="label">{f.label}</label>
                  <input type="number" className="input" value={settings?.[f.key] || 0} onChange={e => set(f.key, parseInt(e.target.value))} min={0} />
                </div>
              ))}
            </div>
          </div>

          {/* Spin wheel frequency */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">🎡 Spin the Wheel</h2>
            <div className="mb-3">
              <label className="label">Spin Frequency</label>
              <select className="input" value={settings?.spin_frequency || 'weekly'} onChange={e => set('spin_frequency', e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="off">Off</option>
              </select>
            </div>
            <SpinPrizeManager />
          </div>

          {/* Daily Gestures */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-sm flex items-center gap-2">💌 Daily Gestures</h2>
              <button onClick={() => set('gestures_enabled', !settings?.gestures_enabled)}
                className={`px-3 py-1 text-xs rounded-lg border font-medium transition-colors ${settings?.gestures_enabled ? 'bg-noch-green/10 text-noch-green border-noch-green/30' : 'border-noch-border text-noch-muted'}`}>
                {settings?.gestures_enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            {settings?.gestures_enabled && (
              <>
                <div className="mb-3">
                  <label className="label">Max Gestures per Day</label>
                  <input type="number" className="input" value={settings?.gestures_max_per_day || 2} onChange={e => set('gestures_max_per_day', parseInt(e.target.value))} min={1} max={10} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'gesture_prayer', label: '🕌 Prayer Times' },
                    { key: 'gesture_hydration', label: '💧 Hydration' },
                    { key: 'gesture_word', label: '📖 Word of Day' },
                    { key: 'gesture_puzzle', label: '🧩 Puzzle' },
                    { key: 'gesture_humor', label: '😄 Humor' },
                    { key: 'gesture_affirmation', label: '✨ Affirmation' },
                  ].map(g => (
                    <button key={g.key} onClick={() => set(g.key, !settings?.[g.key])}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors ${settings?.[g.key] ? 'border-noch-green/30 bg-noch-green/10 text-noch-green' : 'border-noch-border text-noch-muted'}`}>
                      {settings?.[g.key] ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      {g.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Post-Visit Feedback */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-sm flex items-center gap-2"><MessageSquare size={14} className="text-blue-400" /> Post-Visit Feedback</h2>
              <button onClick={() => set('feedback_enabled', !settings?.feedback_enabled)}
                className={`px-3 py-1 text-xs rounded-lg border font-medium transition-colors ${settings?.feedback_enabled ? 'bg-noch-green/10 text-noch-green border-noch-green/30' : 'border-noch-border text-noch-muted'}`}>
                {settings?.feedback_enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            {settings?.feedback_enabled && (
              <div>
                <label className="label">Request feedback after visit (hours)</label>
                <input type="number" className="input" value={settings?.feedback_delay_hours || 2} onChange={e => set('feedback_delay_hours', parseInt(e.target.value))} min={0} max={48} />
              </div>
            )}
          </div>

          {/* Win-Back & Birthday */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Calendar size={14} className="text-purple-400" /> Automation</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 cursor-pointer col-span-2">
                <input type="checkbox" checked={settings?.winback_auto_send || false} onChange={e => set('winback_auto_send', e.target.checked)} className="w-4 h-4 accent-noch-green" />
                <span className="text-white text-sm">Auto Win-Back Messages</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer col-span-2">
                <input type="checkbox" checked={settings?.birthday_message_enabled || false} onChange={e => set('birthday_message_enabled', e.target.checked)} className="w-4 h-4 accent-noch-green" />
                <span className="text-white text-sm">Birthday Messages</span>
              </label>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Trophy size={14} className="text-yellow-400" /> Leaderboard</h2>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings?.leaderboard_public || false} onChange={e => set('leaderboard_public', e.target.checked)} className="w-4 h-4 accent-noch-green" />
                <span className="text-white text-sm">Public Leaderboard</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings?.leaderboard_to_vestaboard || false} onChange={e => set('leaderboard_to_vestaboard', e.target.checked)} className="w-4 h-4 accent-noch-green" />
                <span className="text-white text-sm">Show Top 3 on Vestaboard</span>
              </label>
            </div>
          </div>

          {/* Milestone Freebies */}
          <div className="card">
            <h2 className="text-white font-semibold text-sm mb-3">🏅 Milestone Freebies</h2>
            <div className="flex flex-col gap-3">
              {[
                { key: 'milestone_silver_freebie', label: '🥈 Silver Freebie' },
                { key: 'milestone_gold_freebie', label: '🥇 Gold Freebie' },
                { key: 'milestone_legend_freebie', label: '👑 Legend Freebie' },
              ].map(f => (
                <div key={f.key}>
                  <label className="label">{f.label}</label>
                  <input className="input" value={settings?.[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          {/* Google Maps URLs per branch */}
          {branches.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <MapPin size={16} className="text-noch-green" />
                <h2 className="text-white font-semibold text-sm">Google Maps URLs</h2>
              </div>
              <div className="flex flex-col gap-4">
                {branches.map(branch => (
                  <div key={branch.id}>
                    <label className="label">{branch.name}</label>
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        type="url"
                        placeholder="Paste Google Maps business profile URL..."
                        value={branchUrls[branch.id] || ''}
                        onChange={e => setBranchUrls(prev => ({ ...prev, [branch.id]: e.target.value }))}
                      />
                      <button onClick={() => handleSaveBranchUrl(branch.id)} disabled={savingBranch === branch.id} className="btn-primary px-3 flex items-center gap-1">
                        <Save size={14} />
                        {savingBranch === branch.id ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
