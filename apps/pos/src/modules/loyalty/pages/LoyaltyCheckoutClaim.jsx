import { useEffect, useState } from 'react'
import { Loader2, Mail, Phone } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { posMessage, posError } from '../../pos/lib/pos-messages'
import nochiCustomerFace from '../../../assets/nochi-customer-face.png'
import nochLogo from '../../../assets/noch-logo-menu.webp'
import '../../../pages/storefront/styles/Menu.css'
import './LoyaltyCheckoutClaim.css'
import {
  joinAndClaimLoyaltyCheckoutV2,
  updateMyLoyaltyProfileV2,
} from '../lib/loyalty-supabase'

const celebrationPieces = [
  ['8%', '12%', '#4ADE80'], ['22%', '2%', '#FBBF24'], ['40%', '10%', '#60A5FA'],
  ['63%', '4%', '#F472B6'], ['80%', '14%', '#4ADE80'], ['92%', '1%', '#FBBF24'],
]

export default function LoyaltyCheckoutClaim() {
  const { token } = useParams()
  const [lang, setLang] = useState('ar')
  const ar = lang === 'ar'
  const [channel, setChannel] = useState('phone')
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [fullName, setFullName] = useState('')
  const [verified, setVerified] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [consentBusy, setConsentBusy] = useState(false)
  const firstMission = result?.missions?.[0]
  const visitsLeft = firstMission ? Math.max(0, firstMission.target_count - firstMission.progress_count) : null

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setVerified(true)
    })
  }, [])

  useEffect(() => {
    if (!result || result.status === 'settled') return undefined
    let active = true
    const timer = window.setInterval(async () => {
      const { data, error: statusError } = await supabase.rpc('get_my_loyalty_checkout_v2', {
        p_token: token,
      })
      if (!active || statusError) return
      setResult(data)
      if (data.status === 'settled') window.clearInterval(timer)
    }, 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [result, token])

  const sendCode = async () => {
    setBusy(true)
    setError('')
    try {
      const credentials = channel === 'phone'
        ? { phone: identifier.trim() }
        : { email: identifier.trim().toLowerCase() }
      const { error: otpError } = await supabase.auth.signInWithOtp({
        ...credentials,
        options: { shouldCreateUser: true },
      })
      if (otpError) throw otpError
      setCodeSent(true)
    } catch (err) {
      console.error('Verification delivery failed', err)
      setError(posError(err, 'Could not send the verification code', lang))
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async () => {
    setBusy(true)
    setError('')
    try {
      const verification = channel === 'phone'
        ? { phone: identifier.trim(), token: otp.trim(), type: 'sms' }
        : { email: identifier.trim().toLowerCase(), token: otp.trim(), type: 'email' }
      const { error: verifyError } = await supabase.auth.verifyOtp(verification)
      if (verifyError) throw verifyError
      setVerified(true)
    } catch (err) {
      console.error('Verification failed', err)
      setError(posError(err, 'That verification code did not work', lang))
    } finally {
      setBusy(false)
    }
  }

  const claimCheckout = async () => {
    if (!fullName.trim()) {
      setError(posMessage('Please enter your name', lang))
      return
    }
    setBusy(true)
    setError('')
    try {
      setResult(await joinAndClaimLoyaltyCheckoutV2(token, fullName.trim()))
    } catch (err) {
      console.error('Checkout claim failed', err)
      setError(posError(err, 'Could not link this transaction', lang))
    } finally {
      setBusy(false)
    }
  }

  const updateConsent = async (whatsappOptIn, marketingOptIn) => {
    setConsentBusy(true)
    setError('')
    try {
      await updateMyLoyaltyProfileV2({
        whatsappOptIn,
        marketingOptIn,
        preferredLanguage: ar ? 'ar' : 'en',
      })
      setResult(current => ({
        ...current,
        consentSaved: true,
        whatsappOptIn,
        marketingOptIn,
      }))
    } catch (consentError) {
      console.error('Contact choice failed', consentError)
      setError(posError(consentError, 'Could not save consent', lang))
    } finally {
      setConsentBusy(false)
    }
  }

  return (
    <main lang={lang} dir={ar ? 'rtl' : 'ltr'} className="menu-root nochi-claim">
      <header className="menu-header">
        <div className="nochi-claim-header">
          <div className="nochi-claim-brand">
            <img src={nochLogo} alt="Noch" width="48" height="40" />
            <h1>{ar ? 'صديق نوتشي' : 'Nochi Friend'}</h1>
          </div>
          <button type="button" className="lang-toggle" onClick={() => setLang(ar ? 'en' : 'ar')}>{ar ? 'English' : 'العربية'}</button>
        </div>
      </header>
      <div className="nochi-claim-content">
        <div className="relative mb-5 text-center">
          {result?.status === 'settled' && <>
            <style>{`@keyframes nochi-celebrate { 0% { opacity: 0; transform: translateY(8px) scale(.5) rotate(0deg) } 30% { opacity: 1 } 100% { opacity: 0; transform: translateY(-32px) scale(1) rotate(140deg) } } @media (prefers-reduced-motion: reduce) { .nochi-celebration { animation: none !important; opacity: .8 !important; } }`}</style>
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-4 h-20 overflow-hidden">
              {celebrationPieces.map(([left, top, color], index) => <span key={left} className="nochi-celebration absolute h-2 w-2 rounded-sm" style={{ left, top, backgroundColor: color, animation: `nochi-celebrate 900ms ease-out ${index * 90}ms both` }} />)}
            </div>
          </>}
          <img
            src={nochiCustomerFace}
            alt={ar ? 'وجه نوتشي' : 'Nochi face'}
            className="nochi-claim-face"
            width="144"
            height="144"
          />
          {!result && <p className="mt-1 text-sm text-noch-muted">
            {ar ? 'اربط طلبك واجمع نقاطك.' : 'Link your purchase and collect points.'}
          </p>
          }
        </div>

        <section className="nochi-claim-card space-y-4">
          {result ? (
            <div className="py-2 text-center">
              <h2 className="text-xl font-bold text-noch-green">
                {result.status === 'settled' ? (ar ? 'تمت إضافة النقاط' : 'Points added') : (ar ? 'تم ربط الطلب' : 'Purchase linked')}
              </h2>
              {result.status === 'settled' ? (
                <>
                  <p className="nochi-claim-earned"><bdi dir="ltr">+{result.points_earned}</bdi> {ar ? 'نقطة' : 'points'}</p>
                  <p className="mt-1 text-sm text-noch-muted">
                    {ar ? 'رصيدك الآن' : 'Your balance'} <span className="font-semibold text-white">{result.points_balance} {ar ? 'نقطة' : 'points'}</span>
                  </p>
                </>
              ) : (
                <p className="mt-3 flex items-center justify-center gap-2 text-sm text-noch-muted">
                  <Loader2 size={15} className="animate-spin" /> {ar ? 'بانتظار إتمام الدفع…' : 'Waiting for payment…'}
                </p>
              )}
              {result.status === 'settled' && result.available_rewards > 0 && (
                <p className="nochi-claim-reward">
                  {ar ? `لديك ${result.available_rewards} مكافأة جاهزة` : `${result.available_rewards} reward${result.available_rewards === 1 ? '' : 's'} ready`}
                </p>
              )}
              {result.status === 'settled' && result.available_rewards === 0 && firstMission && (
                <div className="mt-4 rounded-xl border border-noch-border px-4 py-3">
                  <p className="text-sm font-semibold text-white">
                    {visitsLeft === 0
                      ? (ar ? 'أكملت هدفك القادم!' : 'You reached your next goal!')
                      : (ar ? `باقي ${visitsLeft} ${visitsLeft === 1 ? 'زيارة' : 'زيارات'} للهدف القادم` : `${visitsLeft} visit${visitsLeft === 1 ? '' : 's'} to your next goal`)}
                  </p>
                  <p className="mt-1 text-xs text-noch-muted">{ar ? `${firstMission.progress_count} من ${firstMission.target_count}` : `${firstMission.progress_count} of ${firstMission.target_count}`}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-noch-green" style={{ width: `${Math.min(100, (firstMission.progress_count / firstMission.target_count) * 100)}%` }} />
                  </div>
                </div>
              )}
              {result.status === 'settled' && !result.consentSaved && (
                <div className="mt-5 border-t border-noch-border pt-4">
                  <p className="text-sm text-noch-muted">{ar ? 'هل ترغب بعروض نوتش عبر واتساب؟' : 'Would you like Noch offers on WhatsApp?'}</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <button disabled={consentBusy} className="btn-primary text-sm" onClick={() => updateConsent(true, true)}>
                      {ar ? 'نعم' : 'Yes'}
                    </button>
                    <button disabled={consentBusy} className="btn-secondary text-sm" onClick={() => updateConsent(false, false)}>
                      {ar ? 'ليس الآن' : 'Not now'}
                    </button>
                  </div>
                </div>
              )}
              {result.consentSaved && (
                <p className="mt-4 text-xs text-noch-green">{ar ? 'تم حفظ اختيارك ويمكن تغييره لاحقاً.' : 'Your choice is saved and can be changed later.'}</p>
              )}
              <p className="mt-5 text-sm text-noch-muted">
                {result.status === 'settled' ? (ar ? 'تم — يمكنك إغلاق الصفحة.' : 'Done — you can close this page.') : (ar ? 'اترك الصفحة مفتوحة حتى اكتمال الدفع.' : 'Keep this page open until payment completes.')}
              </p>
            </div>
          ) : !verified ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setChannel('phone'); setCodeSent(false); setOtp(''); setError('') }}
                  className={channel === 'phone' ? 'btn-primary' : 'btn-secondary'}
                >
                  <Phone size={15} className="me-2 inline" /> {ar ? 'هاتف' : 'Phone'}
                </button>
                <button
                  type="button"
                  onClick={() => { setChannel('email'); setCodeSent(false); setOtp(''); setError('') }}
                  className={channel === 'email' ? 'btn-primary' : 'btn-secondary'}
                >
                  <Mail size={15} className="me-2 inline" /> {ar ? 'بريد' : 'Email'}
                </button>
              </div>
              <label className="block text-sm text-noch-muted">
                {channel === 'phone' ? (ar ? 'رقم هاتفك' : 'Your phone number') : (ar ? 'بريدك الإلكتروني' : 'Your email')}
                <input
                  className="input mt-2 w-full"
                  type={channel === 'phone' ? 'tel' : 'email'}
                  inputMode={channel === 'phone' ? 'tel' : 'email'}
                  autoComplete={channel === 'phone' ? 'tel' : 'email'}
                  value={identifier}
                  onChange={event => setIdentifier(event.target.value)}
                  placeholder={channel === 'phone' ? '+218 9X XXX XXXX' : 'you@example.com'}
                />
              </label>
              {!codeSent ? (
                <button type="button" className="btn-primary w-full" disabled={busy || !identifier.trim()} onClick={sendCode}>
                  {busy ? <Loader2 size={17} className="mx-auto animate-spin" /> : (ar ? 'إرسال رمز خاص' : 'Send private code')}
                </button>
              ) : (
                <>
                  <label className="block text-sm text-noch-muted">
                    {ar ? 'رمز التحقق' : 'Verification code'}
                    <input
                      className="input mt-2 w-full text-center tracking-[0.3em]"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={event => setOtp(event.target.value)}
                      placeholder="000000"
                    />
                  </label>
                  <button type="button" className="btn-primary w-full" disabled={busy || otp.trim().length < 6} onClick={verifyCode}>
                    {busy ? <Loader2 size={17} className="mx-auto animate-spin" /> : (ar ? 'تحقق' : 'Verify')}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <label className="block text-sm text-noch-muted">
                {ar ? 'اسمك' : 'Your name'}
                <input
                  className="input mt-2 w-full"
                  autoComplete="name"
                  value={fullName}
                  onChange={event => setFullName(event.target.value)}
                  placeholder={ar ? 'الاسم الظاهر في بطاقة الولاء' : 'Name shown on your loyalty card'}
                />
              </label>
              <button type="button" className="btn-primary w-full" disabled={busy || !fullName.trim()} onClick={claimCheckout}>
                {busy ? <Loader2 size={17} className="mx-auto animate-spin" /> : (ar ? 'اجمع نقاط هذا الطلب' : 'Collect points for this purchase')}
              </button>
            </>
          )}

          {error && <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </section>

        {!result && <p className="mt-4 text-center text-xs text-noch-muted">
          {ar ? 'رمز الطلب لمرة واحدة وينتهي خلال خمس دقائق.' : 'This one-time transaction code expires in five minutes and cannot be reused.'}
        </p>}
      </div>
    </main>
  )
}
