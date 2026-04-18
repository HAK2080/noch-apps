// LoyaltyQR — Fullscreen rotating QR for counter display
// Refreshes every 5 minutes automatically

import { useState, useEffect, useCallback } from 'react'
import { QrCode, RefreshCw, Maximize2 } from 'lucide-react'
import { useLanguage } from '../../../contexts/LanguageContext'
import Layout from '../../../components/Layout'
import { generateLoyaltyQR } from '../../../lib/supabase'
import toast from 'react-hot-toast'
let nochiImg = null
try { nochiImg = new URL('../../../assets/nochi-happy.svg', import.meta.url).href } catch { nochiImg = null }

// Simple inline QR using a public QR API
function QRImage({ value, size = 200 }) {
  const encoded = encodeURIComponent(value)
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&color=39d353&bgcolor=0a0a0a&margin=10`}
      alt="QR Code"
      className="rounded-2xl"
      width={size}
      height={size}
    />
  )
}

export default function LoyaltyQR() {
  const { lang } = useLanguage()
  const [token, setToken] = useState(null)
  const [expiresAt, setExpiresAt] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(300)
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const ar = lang === 'ar'

  const fetchToken = useCallback(async () => {
    setLoading(true)
    try {
      const data = await generateLoyaltyQR()
      setToken(data.token)
      setExpiresAt(data.expires_at)
      setSecondsLeft(data.expires_in_seconds || 300)
    } catch {
      toast.error(ar ? 'خطأ في توليد QR' : 'QR generation error')
    } finally {
      setLoading(false)
    }
  }, [ar])

  useEffect(() => { fetchToken() }, [fetchToken])

  // Countdown and auto-refresh
  useEffect(() => {
    if (!token) return
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          fetchToken()
          return 300
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [token, fetchToken])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const countdownColor = secondsLeft < 60 ? 'text-red-400' : secondsLeft < 120 ? 'text-yellow-400' : 'text-noch-green'

  const QRContent = (
    <div className={`flex flex-col items-center justify-center gap-6 ${fullscreen ? 'min-h-screen bg-noch-dark p-8' : ''}`}>
      {/* Nochi mascot */}
      <div className="flex items-center gap-3">
        {nochiImg
          ? <img src={nochiImg} alt="Nochi" className="w-14 h-14 object-contain animate-bounce" />
          : <span className="text-4xl animate-bounce">🐰</span>
        }
        <div>
          <h2 className="text-white font-bold text-xl">Nochi Loyalty</h2>
          <p className="text-noch-muted text-sm">{ar ? 'امسح للحصول على طابع' : 'Scan to earn a stamp'}</p>
        </div>
      </div>

      {/* QR Code */}
      {loading ? (
        <div className="w-48 h-48 bg-noch-border rounded-2xl animate-pulse" />
      ) : token ? (
        <div className="relative">
          <QRImage value={token} size={fullscreen ? 280 : 200} />
          {/* Overlay token text for manual entry */}
          <div className="mt-2 text-center">
            <p className="text-noch-muted text-xs">{ar ? 'أو أدخل الرمز:' : 'Or enter code:'}</p>
            <p className="text-noch-green font-mono font-bold text-lg tracking-widest">{token}</p>
          </div>
        </div>
      ) : null}

      {/* Countdown */}
      <div className="text-center">
        <p className={`font-mono text-2xl font-bold ${countdownColor}`}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </p>
        <p className="text-noch-muted text-xs">{ar ? 'ينتهي بعد' : 'Expires in'}</p>
      </div>

      {/* Steps */}
      <div className={`${fullscreen ? 'max-w-xs' : 'w-full'} space-y-2 text-center`}>
        <p className="text-noch-muted text-xs">
          {ar
            ? '1. العميل يفتح تطبيق نوتشي على هاتفه\n2. يضغط "امسح QR"\n3. يوجّه الكاميرا للقراءة\n4. الطابع يُمنح تلقائياً!'
            : '1. Customer opens Nochi app\n2. Taps "Scan QR"\n3. Points camera at the code\n4. Stamp awarded automatically!'
          }
        </p>
      </div>
    </div>
  )

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-noch-dark flex flex-col items-center justify-center">
        <button
          onClick={() => setFullscreen(false)}
          className="absolute top-4 end-4 text-noch-muted hover:text-white p-2"
        >
          ✕
        </button>
        {QRContent}
      </div>
    )
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-white font-bold text-xl">{ar ? 'QR الكاونتر' : 'Counter QR'}</h1>
          <p className="text-noch-muted text-sm">{ar ? 'اعرضه للعملاء عند الدفع' : 'Show to customers at checkout'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchToken} className="btn-secondary p-2.5"><RefreshCw size={16} /></button>
          <button onClick={() => setFullscreen(true)} className="btn-primary p-2.5"><Maximize2 size={16} /></button>
        </div>
      </div>

      <div className="card">
        {QRContent}
      </div>
    </Layout>
  )
}
