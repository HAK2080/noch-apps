import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, LockKeyhole, Mail, Phone } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

export default function LoyaltyCheckoutClaim() {
  const { token } = useParams()
  const [channel, setChannel] = useState('phone')
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [fullName, setFullName] = useState('')
  const [verified, setVerified] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

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
      setError(err.message || 'Could not send the verification code')
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
      setError(err.message || 'That verification code did not work')
    } finally {
      setBusy(false)
    }
  }

  const claimCheckout = async () => {
    if (!fullName.trim()) {
      setError('Please enter your name')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error: registrationError } = await supabase.rpc('register_loyalty_member_v2', {
        p_full_name: fullName.trim(),
      })
      if (registrationError) throw registrationError

      const { data, error: claimError } = await supabase.rpc('claim_loyalty_checkout_v2', {
        p_token: token,
      })
      if (claimError) throw claimError
      setResult(data)
    } catch (err) {
      setError(err.message || 'Could not link this transaction')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-noch-dark px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-noch-green/15 text-noch-green">
            {result ? <CheckCircle2 size={30} /> : <LockKeyhole size={28} />}
          </div>
          <h1 className="text-2xl font-bold">Noch Loyalty V2</h1>
          <p className="mt-2 text-sm text-noch-muted">
            Link this purchase privately. The cashier never sees or hears your phone number.
          </p>
        </div>

        <section className="card space-y-4">
          {result ? (
            <div className="py-4 text-center">
              <h2 className="text-xl font-bold text-noch-green">
                {result.status === 'settled' ? 'Points added' : 'Purchase linked'}
              </h2>
              <p className="mt-2 text-white">{result.full_name}</p>
              {result.status === 'settled' ? (
                <p className="mt-3 text-2xl font-bold text-white">+{result.points_earned} points</p>
              ) : (
                <p className="mt-3 flex items-center justify-center gap-2 text-sm text-noch-muted">
                  <Loader2 size={15} className="animate-spin" /> Waiting for payment…
                </p>
              )}
              <p className="mt-1 text-sm text-noch-muted">
                Current balance: <span className="font-semibold text-white">{result.points_balance} points</span>
              </p>
              {result.status === 'settled' && result.available_rewards > 0 && (
                <p className="mt-3 rounded-lg bg-yellow-300/10 px-3 py-2 text-sm text-yellow-200">
                  {result.available_rewards} reward{result.available_rewards === 1 ? '' : 's'} available
                </p>
              )}
              {result.status === 'settled' && result.missions?.length > 0 && (
                <div className="mt-4 space-y-2 text-left">
                  {result.missions.map(mission => (
                    <div key={mission.mission_id} className="rounded-lg border border-noch-border px-3 py-2">
                      <p className="text-sm font-medium text-white">{mission.title}</p>
                      <p className="text-xs text-noch-muted">{mission.progress_count} of {mission.target_count} completed</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-5 text-sm text-noch-muted">
                {result.status === 'settled' ? 'Done — you can close this page.' : 'Keep this page open until payment completes.'}
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
                  <Phone size={15} className="mr-2 inline" /> Phone
                </button>
                <button
                  type="button"
                  onClick={() => { setChannel('email'); setCodeSent(false); setOtp(''); setError('') }}
                  className={channel === 'email' ? 'btn-primary' : 'btn-secondary'}
                >
                  <Mail size={15} className="mr-2 inline" /> Email
                </button>
              </div>
              <label className="block text-sm text-noch-muted">
                {channel === 'phone' ? 'Your phone number' : 'Your email'}
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
                  {busy ? <Loader2 size={17} className="mx-auto animate-spin" /> : 'Send private code'}
                </button>
              ) : (
                <>
                  <label className="block text-sm text-noch-muted">
                    Verification code
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
                    {busy ? <Loader2 size={17} className="mx-auto animate-spin" /> : 'Verify'}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <label className="block text-sm text-noch-muted">
                Your name
                <input
                  className="input mt-2 w-full"
                  autoComplete="name"
                  value={fullName}
                  onChange={event => setFullName(event.target.value)}
                  placeholder="Name shown on your loyalty card"
                />
              </label>
              <button type="button" className="btn-primary w-full" disabled={busy || !fullName.trim()} onClick={claimCheckout}>
                {busy ? <Loader2 size={17} className="mx-auto animate-spin" /> : 'Collect points for this purchase'}
              </button>
            </>
          )}

          {error && <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </section>

        <p className="mt-4 text-center text-xs text-noch-muted">
          This one-time transaction code expires in five minutes and cannot be reused.
        </p>
      </div>
    </main>
  )
}
