import { useState, useEffect, useRef } from 'react'
import { Plus, Send, CheckSquare, Trash2, X, RefreshCw, UserCheck, Share2, Pencil, Save, Bell, Eye, EyeOff, Shield, Link as LinkIcon } from 'lucide-react'
import { getStaffProfiles, createStaffProfile, deleteProfile, getTasks, updateProfile, supabase } from '../lib/supabase'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermission } from '../lib/usePermission'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import ConfirmModal from '../components/shared/ConfirmModal'
import EmptyState from '../components/shared/EmptyState'
import toast from 'react-hot-toast'

const ROLE_COLORS = {
  owner: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  supervisor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  accountant: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  staff: 'text-noch-green bg-noch-green/10 border-noch-green/30',
  limited_staff: 'text-noch-muted bg-noch-muted/10 border-noch-muted/30',
}

function StaffModal({ staff, roles, branches, onSave, onClose, canSeeSalaries, canEditRole }) {
  const isEdit = !!staff?.id
  const [form, setForm] = useState(isEdit ? {
    full_name: staff.full_name || '',
    telegram_chat_id: staff.telegram_chat_id || '',
    phone: staff.phone || '',
    photo_url: staff.photo_url || '',
    monthly_salary: staff.monthly_salary || '',
    hourly_rate: staff.hourly_rate || '',
    employment_type: staff.employment_type || 'full_time',
    start_date: staff.start_date || '',
    pin_code: staff.pin_code || '',
    department: staff.department || '',
    branch_id: staff.branch_id || '',
    app_role_id: staff.app_role_id || '',
    is_active: staff.is_active !== false,
  } : {
    full_name: '', telegram_chat_id: '', phone: '', photo_url: '',
    monthly_salary: '', hourly_rate: '', employment_type: 'full_time',
    start_date: '', pin_code: '', department: '', branch_id: '', app_role_id: '', is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [sendWhatsAppInvite, setSendWhatsAppInvite] = useState(!isEdit)
  const [email, setEmail] = useState(isEdit ? (staff.email || '') : '')
  const [password, setPassword] = useState('')
  const [provisionMode, setProvisionMode] = useState('password') // 'password' | 'invite'
  const [resetMode, setResetMode] = useState('set') // 'set' | 'email'
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetting, setResetting] = useState(false)
  const photoRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('staff-photos').upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('staff-photos').getPublicUrl(path)
      set('photo_url', data.publicUrl)
      toast.success('Photo uploaded')
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleResetPassword = async () => {
    if (resetMode === 'set' && newPassword.length < 6) {
      toast.error('Password must be at least 6 characters'); return
    }
    setResetting(true)
    try {
      const { data, error } = await supabase.functions.invoke('reset-staff-password', {
        body: { staffId: staff.id, newPassword: resetMode === 'set' ? newPassword : undefined, mode: resetMode },
      })
      if (error) {
        let msg = error.message
        try { const b = await error.context?.json(); msg = b?.error || msg } catch {}
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      toast.success(resetMode === 'set' ? 'Password updated' : 'Reset email sent')
      setNewPassword('')
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setResetting(false)
    }
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    try {
      const payload = {
        full_name: form.full_name.trim(),
        telegram_chat_id: form.telegram_chat_id.trim() || null,
        phone: form.phone.trim() || null,
        photo_url: form.photo_url || null,
        employment_type: form.employment_type,
        start_date: form.start_date || null,
        pin_code: form.pin_code.trim() || null,
        department: form.department.trim() || null,
        branch_id: form.branch_id || null,
        is_active: form.is_active,
      }
      if (canSeeSalaries) {
        payload.monthly_salary = form.monthly_salary ? parseFloat(form.monthly_salary) : null
        payload.hourly_rate = form.hourly_rate ? parseFloat(form.hourly_rate) : null
      }
      if (canEditRole) {
        payload.app_role_id = form.app_role_id || null
      }

      if (isEdit) {
        if (email.trim()) payload.email = email.trim()
        await updateProfile(staff.id, payload)
      } else {
        if (!email.trim()) { toast.error('Email required for login'); setSaving(false); return }
        if (provisionMode === 'password' && password.length < 6) {
          toast.error('Password must be at least 6 characters'); setSaving(false); return
        }
        const { data, error } = await supabase.functions.invoke('provision-staff', {
          body: { email: email.trim(), password, mode: provisionMode, profile: payload },
        })
        if (error || data?.error) throw new Error(data?.error || error.message)

        if (sendWhatsAppInvite && payload.phone) {
          const digits = payload.phone.replace(/\D/g, '')
          const loginUrl = 'https://apps.noch.cloud'
          const credsBlock = provisionMode === 'password'
            ? `Login: ${loginUrl}\nEmail: ${email.trim()}\nPassword: ${password}\n\n`
            : `Check your email (${email.trim()}) for a link to set your password, then log in at:\n${loginUrl}\n\n`
          const msg = `Hi ${payload.full_name} 👋\n\nYou've been added to the Noch team.\n\n${credsBlock}To receive tasks & reminders on Telegram, also tap Start here:\nhttps://t.me/Noch_bot\n\n— noch omni`
          window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank')
        }
      }
      toast.success(isEdit ? 'Updated' : 'Staff added')
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 px-0 md:px-4 overflow-y-auto">
      <div className="card w-full md:max-w-lg rounded-t-3xl md:rounded-2xl my-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold">{isEdit ? 'Edit Staff Member' : 'Add Staff Member'}</h2>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {form.photo_url ? (
                <img src={form.photo_url} alt="Staff" className="w-16 h-16 rounded-full object-cover border-2 border-noch-green/30" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-noch-green/10 border-2 border-noch-border flex items-center justify-center text-noch-green font-bold text-2xl">
                  {form.full_name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div>
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              <button onClick={() => photoRef.current?.click()} disabled={uploadingPhoto}
                className="text-xs bg-noch-border text-noch-muted px-3 py-1.5 rounded-lg hover:text-white transition-colors">
                {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
              </button>
            </div>
            <div className="flex-1">
              <label className="label block mb-1">Active</label>
              <button onClick={() => set('is_active', !form.is_active)}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${form.is_active ? 'bg-noch-green/10 text-noch-green border-noch-green/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                {form.is_active ? '✓ Active' : '✗ Inactive'}
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="label">Full Name *</label>
            <input className="input" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Ahmed Mohamed" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+218 9XX XXX XXXX" type="tel" />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" value={form.department} onChange={e => set('department', e.target.value)} placeholder="Barista, Kitchen..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Employment Type</label>
              <select className="input" value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
              </select>
            </div>
            <div>
              <label className="label">Start Date</label>
              <input className="input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
          </div>

          {/* Branch */}
          {branches.length > 0 && (
            <div>
              <label className="label">Branch</label>
              <select className="input" value={form.branch_id} onChange={e => set('branch_id', e.target.value)}>
                <option value="">No branch assigned</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {/* Role — only if canEditRole */}
          {canEditRole && (
            <div>
              <label className="label">App Role</label>
              <select className="input" value={form.app_role_id} onChange={e => set('app_role_id', e.target.value)}>
                <option value="">No role assigned</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name.replace('_', ' ')} (Level {r.level})</option>)}
              </select>
            </div>
          )}

          {/* Salaries — only if canSeeSalaries */}
          {canSeeSalaries && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Monthly Salary (LYD)</label>
                <input className="input" type="number" value={form.monthly_salary} onChange={e => set('monthly_salary', e.target.value)} placeholder="2500" min="0" step="0.01" />
              </div>
              <div>
                <label className="label">Hourly Rate (LYD)</label>
                <input className="input" type="number" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} placeholder="15" min="0" step="0.01" />
              </div>
            </div>
          )}

          {/* PIN Code */}
          <div>
            <label className="label">PIN Code (for POS login)</label>
            <div className="flex gap-2">
              <input
                className="input flex-1 font-mono"
                type={showPin ? 'text' : 'password'}
                value={form.pin_code}
                onChange={e => set('pin_code', e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="4-6 digits"
                maxLength={6}
              />
              <button onClick={() => setShowPin(p => !p)} className="px-3 text-noch-muted hover:text-white">
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-noch-muted mt-1">4-6 digit PIN for POS terminal login</p>
          </div>

          {/* Login account management — only on Edit */}
          {isEdit && (
            <div className="border border-noch-border rounded-xl p-3 space-y-3 bg-noch-dark/40">
              <p className="text-xs text-noch-muted uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <Shield size={11} /> Login Account
              </p>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="staff@noch.ly"
                  autoComplete="off"
                />
                {email && (
                  <p className="text-xs text-noch-muted mt-1">Changing email here only updates the profile record — use Supabase dashboard to change the auth login email.</p>
                )}
              </div>
              <div>
                <label className="label">Reset Password</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setResetMode('set')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs border transition-colors ${resetMode === 'set' ? 'bg-noch-green/10 border-noch-green text-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}
                  >
                    Set New Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetMode('email')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs border transition-colors ${resetMode === 'email' ? 'bg-noch-green/10 border-noch-green text-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}
                  >
                    Send Reset Email
                  </button>
                </div>
                {resetMode === 'set' ? (
                  <div className="flex gap-2">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      className="input flex-1 font-mono"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="New password (min 6 chars)"
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowNewPassword(p => !p)} className="px-3 text-noch-muted hover:text-white">
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPassword(Math.random().toString(36).slice(2, 10))}
                      className="px-3 text-xs text-noch-green border border-noch-green/30 rounded-lg hover:bg-noch-green/10"
                    >
                      Gen
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-noch-muted">Will send a password reset link to their email.</p>
                )}
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetting || (resetMode === 'set' && newPassword.length < 6)}
                  className="mt-2 w-full px-3 py-2 rounded-lg text-xs border border-noch-border text-noch-muted hover:text-white hover:border-noch-green/40 transition-colors disabled:opacity-40"
                >
                  {resetting ? 'Processing...' : resetMode === 'set' ? 'Update Password' : 'Send Reset Email'}
                </button>
              </div>
            </div>
          )}

          {/* Login credentials — only on Add */}
          {!isEdit && (
            <div className="border border-noch-border rounded-xl p-3 space-y-3 bg-noch-dark/40">
              <p className="text-xs text-noch-muted uppercase tracking-wider font-semibold">Login Credentials</p>
              <div>
                <label className="label">Email *</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="staff@noch.ly"
                  autoComplete="off"
                  required
                />
              </div>
              <div>
                <label className="label">Account Setup</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setProvisionMode('password')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs border transition-colors ${provisionMode === 'password' ? 'bg-noch-green/10 border-noch-green text-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}
                  >
                    Set Password Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setProvisionMode('invite')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs border transition-colors ${provisionMode === 'invite' ? 'bg-noch-green/10 border-noch-green text-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}
                  >
                    Email Invite Link
                  </button>
                </div>
              </div>
              {provisionMode === 'password' && (
                <div>
                  <label className="label">Password * <span className="text-noch-muted font-normal">(min 6 chars)</span></label>
                  <div className="flex gap-2">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="input flex-1 font-mono"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="At least 6 characters"
                    />
                    <button type="button" onClick={() => setShowPassword(p => !p)} className="px-3 text-noch-muted hover:text-white">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPassword(Math.random().toString(36).slice(2, 10))}
                      className="px-3 text-xs text-noch-green border border-noch-green/30 rounded-lg hover:bg-noch-green/10"
                      title="Generate random password"
                    >
                      Gen
                    </button>
                  </div>
                </div>
              )}
              {provisionMode === 'invite' && (
                <p className="text-xs text-noch-muted">Staff will receive an email with a link to set their own password.</p>
              )}
            </div>
          )}

          {/* Telegram */}
          <div>
            <label className="label">Telegram Chat ID</label>
            <input className="input" value={form.telegram_chat_id} onChange={e => set('telegram_chat_id', e.target.value)} placeholder="e.g. 123456789" />
          </div>

          {/* Auto-invite toggle — only on Add */}
          {!isEdit && (
            <label className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${form.phone ? 'border-noch-border hover:border-noch-green/40' : 'border-noch-border/40 opacity-60 cursor-not-allowed'}`}>
              <input
                type="checkbox"
                checked={sendWhatsAppInvite && !!form.phone}
                disabled={!form.phone}
                onChange={e => setSendWhatsAppInvite(e.target.checked)}
                className="w-4 h-4 accent-noch-green mt-0.5"
              />
              <div className="flex-1">
                <p className="text-sm text-white font-medium flex items-center gap-1.5">
                  <Send size={13} className="text-noch-green" />
                  Send WhatsApp invite with Telegram bot link
                </p>
                <p className="text-xs text-noch-muted mt-0.5">
                  {form.phone
                    ? `Opens WhatsApp to ${form.phone} with a welcome message + t.me/Noch_bot link`
                    : 'Add a phone number above to enable this'}
                </p>
              </div>
            </label>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-noch-border mt-4">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Save size={14} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Staff() {
  const { t, lang } = useLanguage()
  const can = usePermission()
  const navigate = useNavigate()
  const canEditRole = can('staff', 'edit')
  const canSeeSalaries = can('staff', 'salaries')
  const canManageRoles = can('role_management', 'manage')

  const [staff, setStaff] = useState([])
  const [tasks, setTasks] = useState([])
  const [roles, setRoles] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [editingStaff, setEditingStaff] = useState(null)

  // Telegram scanner
  const [scanning, setScanning] = useState(false)
  const [telegramUsers, setTelegramUsers] = useState([])
  const [newlyDetected, setNewlyDetected] = useState([])
  const [showScanner, setShowScanner] = useState(false)
  const [assigning, setAssigning] = useState(null)
  const pollRef = useRef(null)
  const prevChatIds = useRef(new Set())

  useEffect(() => {
    Promise.all([
      getStaffProfiles(),
      getTasks(),
      supabase.from('app_roles').select('*').order('level', { ascending: false }),
      supabase.from('pos_branches').select('id, name').eq('is_active', true),
    ])
      .then(([s, t, rolesRes, branchRes]) => {
        setStaff(s)
        setTasks(t)
        setRoles(rolesRes.data || [])
        setBranches(branchRes.data || [])
      })
      .catch(() => toast.error(t('error')))
      .finally(() => setLoading(false))
  }, [])

  const openTaskCount = (staffId) =>
    tasks.filter(t => t.assigned_to === staffId && t.status !== 'done').length

  const handleDelete = async () => {
    try {
      await deleteProfile(deleteId)
      setStaff(prev => prev.filter(s => s.id !== deleteId))
      setDeleteId(null)
      toast.success('Staff removed')
    } catch {
      toast.error(t('error'))
    }
  }

  const scanBot = async (silent = false) => {
    if (!silent) setScanning(true)
    setShowScanner(true)
    try {
      let users = []
      try {
        const { data, error } = await supabase.functions.invoke('get-telegram-ids')
        if (!error && data?.users) users = data.users
      } catch {
        if (!silent) toast('Bot server unavailable', { icon: '⚠️' })
        users = []
      }
      const newly = users.filter(u => !prevChatIds.current.has(u.chat_id))
      if (newly.length > 0 && prevChatIds.current.size > 0) {
        setNewlyDetected(newly.map(u => u.chat_id))
        newly.forEach(u => toast.success(`${u.name || 'Someone'} just messaged the bot! 🎉`, { duration: 6000, icon: '📱' }))
      }
      users.forEach(u => prevChatIds.current.add(u.chat_id))
      setTelegramUsers(users)
      if (!users.length && !silent) toast('No one has messaged the bot yet', { icon: '⚠️' })
    } catch (err) {
      if (!silent) { toast.error(err.message || t('error')); setShowScanner(false) }
    } finally {
      if (!silent) setScanning(false)
    }
  }

  useEffect(() => {
    if (showScanner) pollRef.current = setInterval(() => scanBot(true), 20000)
    else { clearInterval(pollRef.current); setNewlyDetected([]) }
    return () => clearInterval(pollRef.current)
  }, [showScanner])

  const assignChatId = async (staffId, chatId) => {
    setAssigning(staffId)
    try {
      await updateProfile(staffId, { telegram_chat_id: String(chatId) })
      setStaff(prev => prev.map(s => s.id === staffId ? { ...s, telegram_chat_id: String(chatId) } : s))
      toast.success('Chat ID assigned')
    } catch { toast.error(t('error')) }
    finally { setAssigning(null) }
  }

  const getRoleName = (s) => {
    const role = roles.find(r => r.id === s.app_role_id)
    return role?.name || s.role
  }

  const getRole = (s) => roles.find(r => r.id === s.app_role_id)

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white font-bold text-xl">{t('staff')}</h1>
        <div className="flex gap-2 flex-wrap">
          {canManageRoles && (
            <button onClick={() => navigate('/staff/roles')} className="btn-secondary flex items-center gap-2">
              <Shield size={15} /> Manage Roles
            </button>
          )}
          <button onClick={() => scanBot(false)} disabled={scanning} className="btn-secondary flex items-center gap-2">
            {scanning ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
            Scan Bot
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> {t('addStaff')}
          </button>
        </div>
      </div>

      {/* Telegram Scanner Panel */}
      {showScanner && (
        <div className="card mb-6 border-noch-green/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Send size={16} className="text-noch-green" />
                People who messaged the bot
              </h2>
              <p className="text-noch-muted text-xs mt-0.5 flex items-center gap-2">
                Click Assign to link a person to a staff member
                <span className="flex items-center gap-1 text-noch-green text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-noch-green animate-pulse inline-block" />
                  Auto-refreshing every 20s
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a href={`https://wa.me/?text=${encodeURIComponent('Hey 👋\nTo receive your tasks on Telegram, open this link:\nhttps://t.me/Noch_bot')}`}
                target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs bg-green-600/20 border border-green-600/40 text-green-400 px-3 py-1.5 rounded-lg hover:bg-green-600/30 transition-colors">
                <Share2 size={12} /> Share via WhatsApp
              </a>
              <button onClick={() => setShowScanner(false)} className="text-noch-muted hover:text-white"><X size={18} /></button>
            </div>
          </div>

          {scanning ? (
            <p className="text-noch-muted text-sm text-center py-4">{t('loading')}</p>
          ) : telegramUsers.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-noch-muted text-sm mb-3">No one has messaged the bot yet. Ask staff to message the bot first.</p>
              <a href="https://t.me/Noch_bot" target="_blank" rel="noreferrer" className="text-noch-green text-xs bg-noch-dark px-3 py-1.5 rounded-lg hover:text-green-300 transition-colors">
                t.me/Noch_bot
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {telegramUsers.map(u => {
                const isNew = newlyDetected.includes(u.chat_id)
                return (
                  <div key={u.chat_id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${isNew ? 'bg-noch-green/10 border-noch-green/40' : 'bg-noch-dark border-noch-border'}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium">{u.name}</p>
                        {isNew && <span className="text-[10px] px-1.5 py-0.5 bg-noch-green/20 text-noch-green rounded-full font-bold animate-pulse">NEW ✓</span>}
                      </div>
                      <p className="text-noch-muted text-xs">{u.username ? `@${u.username} · ` : ''}Chat ID: <span className="text-noch-green font-mono">{u.chat_id}</span></p>
                    </div>
                    <select className="input text-xs py-1" defaultValue="" onChange={e => e.target.value && assignChatId(e.target.value, u.chat_id)} disabled={assigning !== null}>
                      <option value="">— Assign to —</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          )}
          <button onClick={() => scanBot(false)} disabled={scanning} className="mt-4 text-xs text-noch-muted hover:text-white flex items-center gap-1 transition-colors">
            <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <p className="text-noch-muted text-center py-16">{t('loading')}</p>
      ) : staff.length === 0 ? (
        <EmptyState icon="👥" title={t('noStaff')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {staff.map(s => {
            const open = openTaskCount(s.id)
            const role = getRole(s)
            const roleName = getRoleName(s)
            return (
              <div key={s.id} className={`card flex items-center gap-3 ${!s.is_active ? 'opacity-60' : ''}`}>
                <div className="relative">
                  {s.photo_url ? (
                    <img src={s.photo_url} alt={s.full_name} className="w-11 h-11 rounded-full object-cover border-2 border-noch-green/20" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-noch-green/10 border border-noch-green/20 flex items-center justify-center text-noch-green font-bold text-lg flex-shrink-0">
                      {s.full_name.charAt(0)}
                    </div>
                  )}
                  {!s.is_active && (
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-noch-dark" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold truncate">{s.full_name}</p>
                    {!s.is_active && <span className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded-full border border-red-500/30">Inactive</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {roleName && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[roleName] || 'text-noch-muted bg-noch-border border-noch-border'}`}>
                        {roleName.replace('_', ' ')}
                      </span>
                    )}
                    {s.department && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-noch-border border border-noch-border text-noch-muted">{s.department}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-noch-muted mt-0.5">
                    {s.telegram_chat_id ? (
                      <span className="flex items-center gap-1 text-noch-green">
                        <UserCheck size={11} /> Telegram linked
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-500/70">
                        <Send size={11} /> Not linked
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CheckSquare size={11} />
                      <span className={open > 0 ? 'text-yellow-400' : 'text-noch-muted'}>
                        {open} {t('openTasks')}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setEditingStaff(s)} className="text-noch-muted hover:text-noch-green transition-colors p-1" title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteId(s.id)} className="text-noch-muted hover:text-red-400 transition-colors p-1">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Staff modal (simple quick-add) */}
      {showForm && (
        <StaffModal
          staff={null}
          roles={roles}
          branches={branches}
          canSeeSalaries={canSeeSalaries}
          canEditRole={canEditRole}
          onSave={() => {
            setShowForm(false)
            getStaffProfiles().then(setStaff).catch(() => {})
          }}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Edit Staff modal */}
      {editingStaff && (
        <StaffModal
          staff={editingStaff}
          roles={roles}
          branches={branches}
          canSeeSalaries={canSeeSalaries}
          canEditRole={canEditRole}
          onSave={() => {
            setEditingStaff(null)
            getStaffProfiles().then(setStaff).catch(() => {})
          }}
          onClose={() => setEditingStaff(null)}
        />
      )}

      {deleteId && (
        <ConfirmModal
          message="Are you sure you want to remove this staff member?"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </Layout>
  )
}
