import { useState, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase, updateProfile, setPIN } from '../../lib/supabase'
import Layout from '../../components/Layout'
import { Upload, Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function MyProfile() {
  const { profile, user } = useAuth()
  const { t, lang } = useLanguage()
  const ar = lang === 'ar'
  const fileInputRef = useRef(null)

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
    pin_code: profile?.pin_code || '',
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState({})

  const handleChange = (field, value) => {
    if (field === 'pin_code') {
      // Only allow 4-6 digits
      value = value.replace(/\D/g, '').slice(0, 6)
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Preview
    const reader = new FileReader()
    reader.onload = (evt) => setAvatarPreview(evt.target?.result)
    reader.readAsDataURL(file)
    setAvatar(file)
  }

  const uploadAvatar = async () => {
    if (!avatar) return
    setSaving(prev => ({ ...prev, avatar: true }))
    try {
      const fileName = `${profile.id}-${Date.now()}.jpg`
      const { error } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatar, { upsert: true })
      if (error) throw error

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
      await updateProfile(profile.id, { avatar_url: data.publicUrl })
      setAvatar(null)
      toast.success(ar ? 'تم تحديث الصورة' : 'Avatar updated')
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setSaving(prev => ({ ...prev, avatar: false }))
    }
  }

  const saveProfile = async () => {
    setSaving(prev => ({ ...prev, profile: true }))
    try {
      // Update basic profile info
      await updateProfile(profile.id, {
        full_name: formData.full_name,
        phone: formData.phone,
      })

      // If PIN was changed, update it separately via RPC
      if (formData.pin_code && formData.pin_code !== profile.pin_code) {
        await setPIN(profile.id, formData.pin_code)
      }

      toast.success(ar ? 'تم حفظ البيانات' : 'Profile saved')
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(prev => ({ ...prev, profile: false }))
    }
  }

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(ar ? 'كلمات المرور غير متطابقة' : 'Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      toast.error(ar ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters')
      return
    }

    setSaving(prev => ({ ...prev, password: true }))
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      toast.success(ar ? 'تم تحديث كلمة المرور' : 'Password updated')
    } catch (err) {
      toast.error(err.message || 'Update failed')
    } finally {
      setSaving(prev => ({ ...prev, password: false }))
    }
  }

  return (
    <Layout>
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-white">
          {ar ? 'ملفي الشخصي' : 'My Profile'}
        </h1>

        {/* Avatar Section */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4 text-white">
            {ar ? 'الصورة الشخصية' : 'Profile Photo'}
          </h2>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl text-zinc-400">📷</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary flex items-center gap-2"
              >
                <Upload size={16} />
                {ar ? 'اختر صورة' : 'Choose photo'}
              </button>
              {avatar && (
                <button
                  onClick={uploadAvatar}
                  disabled={saving.avatar}
                  className="btn-primary flex items-center gap-2"
                >
                  {saving.avatar ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {ar ? 'رفع' : 'Upload'}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Profile Info Section */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4 text-white">
            {ar ? 'معلومات الملف' : 'Profile Information'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="label">{ar ? 'الاسم الكامل' : 'Full Name'}</label>
              <input
                type="text"
                className="input"
                value={formData.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
              />
            </div>
            <div>
              <label className="label">{ar ? 'رقم الهاتف' : 'Phone'}</label>
              <input
                type="tel"
                className="input"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
            </div>
            <div>
              <label className="label">{ar ? 'رقم PIN (4-6 أرقام)' : 'PIN Code (4-6 digits)'}</label>
              <input
                type="text"
                inputMode="numeric"
                className="input text-center text-2xl tracking-widest"
                value={formData.pin_code}
                onChange={(e) => handleChange('pin_code', e.target.value)}
                maxLength="6"
                placeholder="0000"
              />
              <p className="text-xs text-zinc-400 mt-1">
                {ar ? 'استخدم هذا الرقم للدخول السريع عند نقطة البيع (4-6 أرقام)' : 'Use this PIN for quick login at POS (4-6 digits)'}
              </p>
            </div>
            <button
              onClick={saveProfile}
              disabled={saving.profile}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {saving.profile ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {saving.profile ? (ar ? 'جاري الحفظ...' : 'Saving...') : (ar ? 'حفظ البيانات' : 'Save Profile')}
            </button>
          </div>
        </div>

        {/* Change Password Section */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-white">
            {ar ? 'تغيير كلمة المرور' : 'Change Password'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="label">{ar ? 'كلمة المرور الجديدة' : 'New Password'}</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <div>
              <label className="label">{ar ? 'تأكيد كلمة المرور' : 'Confirm Password'}</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <button
              onClick={changePassword}
              disabled={saving.password || !newPassword}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {saving.password ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {saving.password ? (ar ? 'جاري التحديث...' : 'Updating...') : (ar ? 'تحديث كلمة المرور' : 'Update Password')}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
