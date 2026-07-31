import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageToggle from '../components/shared/LanguageToggle'
import ThemeToggle from '../components/shared/ThemeToggle'
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

  const location = useLocation()
  useEffect(() => {
    if (!user) return
    const next = new URLSearchParams(location.search).get('next')
    navigate(next && next.startsWith('/') ? next : '/', { replace: true })
  }, [user, location.search, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      toast.error(err.message || t('loginError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="skin-login">
      <section className="skin-login-left">
        <div className="skin-login-content">
          <div className="skin-login-brand">
            <h1><span>noch</span><span>apps</span></h1>
            <p>{t('appTagline')}</p>
          </div>

          <div className="skin-login-form">
            <div className="skin-login-form-title">{t('login')}</div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="label">{t('email')}</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
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
              <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
                {loading ? t('loading') : t('loginBtn')}
              </button>
            </form>

            <div className="skin-login-links">
              <button type="button" onClick={handleForgotPassword} disabled={resetting}>
                {resetting
                  ? (lang === 'ar' ? 'جاري الإرسال...' : 'Sending...')
                  : (lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?')}
              </button>
              <Link to="/staff/request-access">
                {lang === 'ar' ? 'طلب وصول →' : 'Request access →'}
              </Link>
            </div>
          </div>

          <div className="skin-login-language">
            <LanguageToggle variant="staff" />
            <ThemeToggle compact />
          </div>
        </div>
      </section>

      <aside className="skin-login-right" aria-hidden="true">
        <p className="skin-login-eyebrow">NOCH / STAFF OPERATING SYSTEM</p>
        <h2>{lang === 'ar' ? 'كل يوم، بوضوح أكبر.' : 'RUN THE DAY\nWITH BOTH EYES OPEN.'}</h2>
        <p>{lang === 'ar'
          ? 'المبيعات والمخزون والفريق في مكان واحد. قرارات أقل ضجيجاً، ووقت أكثر للمقهى.'
          : 'Sales, stock, and the team in one place. Less noise in the numbers, more time for the café.'}</p>
        <footer>apps.noch.cloud · staff console</footer>
      </aside>
    </div>
  )
}
