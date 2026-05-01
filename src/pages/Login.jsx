import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageToggle from '../components/shared/LanguageToggle'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function Login() {
  const { signIn, user } = useAuth()
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)

  const handleForgotPassword = async () => {
    const target = (email || '').trim()
    if (!target) {
      toast.error(lang === 'ar' ? 'أدخل البريد الإلكتروني أولاً' : 'Enter your email first')
      return
    }
    setResetting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/login`,
      })
      if (error) throw error
      toast.success(lang === 'ar' ? 'تم إرسال رابط إعادة التعيين' : 'Reset link sent — check your email')
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setResetting(false)
    }
  }

  // Navigate once React has committed the updated user state.
  // This avoids the race where navigate('/') fires before the state batch lands.
  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(email, password)
      // Navigation is handled by the useEffect above
    } catch (err) {
      toast.error(err.message || t('loginError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-noch-dark flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-noch-green font-bold text-5xl tracking-tight mb-1">noch omni</h1>
          <p className="text-noch-muted text-sm">{t('appTagline')}</p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="text-white font-semibold text-center mb-5">{t('login')}</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="label">{t('email')}</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="label">{t('password')}</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? t('loading') : t('loginBtn')}
            </button>
          </form>

          <div className="flex justify-between items-center mt-4 text-xs">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetting}
              className="text-noch-muted hover:text-white transition-colors disabled:opacity-50"
            >
              {resetting
                ? (lang === 'ar' ? 'جاري الإرسال...' : 'Sending...')
                : (lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?')}
            </button>
            <Link
              to="/staff/request-access"
              className="text-noch-green hover:underline"
            >
              {lang === 'ar' ? 'طلب وصول →' : 'Request access →'}
            </Link>
          </div>
        </div>

        <div className="flex justify-center mt-6">
          <LanguageToggle />
        </div>
      </div>
    </div>
  )
}
