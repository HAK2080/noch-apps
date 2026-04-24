import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageToggle from '../components/shared/LanguageToggle'
import toast from 'react-hot-toast'

export default function Login() {
  const { signIn } = useAuth()
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
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

          <p className="text-center text-noch-muted text-xs mt-4">
            {lang === 'ar'
              ? 'هذا النظام داخلي — تواصل مع الإدارة للحصول على حساب'
              : 'Internal system — contact admin to get an account'}
          </p>
        </div>

        <div className="flex justify-center mt-6">
          <LanguageToggle />
        </div>
      </div>
    </div>
  )
}
