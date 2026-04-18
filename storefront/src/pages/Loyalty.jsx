import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Loyalty({ lang = 'en' }) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [card, setCard] = useState(null)
  const [error, setError] = useState('')
  const isAr = lang === 'ar'

  const lookup = async () => {
    if (!phone.trim()) return
    setLoading(true); setError(''); setCard(null)
    try {
      const { data, error: err } = await supabase
        .from('loyalty_customers')
        .select('id,full_name,phone,stamps_count,tier,nochi_state,created_at,loyalty_rewards(id,status,created_at)')
        .eq('phone', phone.trim())
        .maybeSingle()
      if (err) throw err
      if (!data) { setError(isAr ? 'لم نجد رقمك. هل أنت مسجّل؟' : "We couldn't find that number. Are you registered?"); return }
      setCard(data)
    } catch {
      setError(isAr ? 'حدث خطأ، حاول مرة أخرى.' : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const stampsNeeded = card ? Math.max(0, 10 - (card.stamps_count || 0)) : 10
  const pendingRewards = card?.loyalty_rewards?.filter(r => r.status === 'pending') || []

  return (
    <div className={`menu-page${isAr ? ' rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <nav className="nav">
        <Link to="/" className="back">{isAr ? '→ رجوع' : '← Back'}</Link>
        <Link to="/" className="logo-sm">
          <img src="/assets/logo.svg" alt="Noch" style={{height:32}} />
        </Link>
      </nav>

      <section className="m-hero" style={{background:'linear-gradient(140deg,#1A1A2E,#0B1020)',color:'#fff',paddingBottom:50}}>
        <span className="kicker" style={{background:'rgba(255,255,255,.1)',border:'none',color:'#FFD700'}}>
          ⭐ {isAr ? 'برنامج الولاء' : 'Nochi Loyalty'}
        </span>
        <h1 style={{color:'#fff'}}>
          {isAr ? <>بطاقة <em style={{color:'var(--orange)'}}>نوتشي</em></> : <><em style={{color:'var(--orange)'}}>Nochi</em> card</>}
        </h1>
        <p style={{color:'rgba(255,255,255,.7)'}}>
          {isAr ? 'كل ١٠ طوابع = مشروب مجاني. اشوف رصيدك.' : 'Every 10 stamps = 1 free drink. Check your balance below.'}
        </p>
        <img className="mascot" src="/assets/mascot-1.svg" alt="Nochi" />
      </section>

      <div style={{maxWidth:480,margin:'40px auto',padding:'0 24px'}}>
        {!card ? (
          <div className="card" style={{gap:16}}>
            <h3 style={{fontFamily:"'Afrodotz','Brooklyn',serif",fontSize:28}}>
              {isAr ? 'ادخل رقمك' : 'Enter your number'}
            </h3>
            <p style={{color:'#6A7290',fontSize:14}}>
              {isAr ? 'نفس الرقم المسجّل في نوتش' : 'Same number you registered at Noch'}
            </p>
            <div className="search" style={{borderRadius:16}}>
              <span style={{fontSize:18}}>📱</span>
              <input
                type="tel"
                placeholder={isAr ? '‎+218 9X XXX XXXX' : '+218 9X XXX XXXX'}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookup()}
                style={{flex:1,border:0,outline:0,fontSize:16,background:'transparent',fontFamily:'inherit'}}
                dir="ltr"
              />
            </div>
            {error && <p style={{color:'var(--pink)',fontSize:14,fontWeight:600}}>{error}</p>}
            <button className="btn" onClick={lookup} disabled={loading} style={{width:'100%',justifyContent:'center'}}>
              {loading ? '...' : (isAr ? 'اشوف بطاقتي' : 'View my card')}
            </button>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {/* Card */}
            <div style={{
              background:'linear-gradient(135deg,#1A1A2E,#0B1020)',color:'#fff',
              borderRadius:24,padding:28,border:'3px solid var(--ink)',boxShadow:'8px 8px 0 var(--ink)'
            }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
                <div>
                  <p style={{opacity:.5,fontSize:12,letterSpacing:2,textTransform:'uppercase'}}>{isAr ? 'بطاقة نوتشي' : 'Nochi Card'}</p>
                  <h2 style={{fontSize:26,marginTop:4}}>{card.full_name}</h2>
                </div>
                <img src="/assets/logo.svg" alt="Noch" style={{height:36,filter:'brightness(0) invert(1)',opacity:.8}} />
              </div>
              {/* Stamp grid */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:16}}>
                {Array.from({length:10}).map((_,i) => (
                  <div key={i} style={{
                    aspectRatio:'1',borderRadius:12,border:'2px solid rgba(255,255,255,.25)',
                    background: i < (card.stamps_count || 0) ? 'var(--orange)' : 'rgba(255,255,255,.05)',
                    display:'grid',placeItems:'center',fontSize:18
                  }}>
                    {i < (card.stamps_count || 0) ? '☕' : ''}
                  </div>
                ))}
              </div>
              <p style={{opacity:.6,fontSize:13}}>
                {stampsNeeded > 0
                  ? (isAr ? `${stampsNeeded} طابع متبقي للمشروب المجاني` : `${stampsNeeded} more to your free drink`)
                  : (isAr ? '🎉 مبروك! عندك مشروب مجاني' : '🎉 You have a free drink ready!')}
              </p>
            </div>

            {pendingRewards.length > 0 && (
              <div className="card" style={{background:'#FFF4DF',gap:8}}>
                <h4 style={{fontFamily:"'Afrodotz','Brooklyn',serif",fontSize:22}}>
                  {isAr ? '🎁 هداياك المجانية' : '🎁 Your free drinks'}
                </h4>
                {pendingRewards.map(r => (
                  <p key={r.id} style={{fontSize:14,color:'#485070'}}>
                    {isAr ? 'مشروب مجاني · اعرضه على الكاشير' : 'Free drink · Show this to the cashier'}
                  </p>
                ))}
              </div>
            )}

            <div className="card" style={{flexDirection:'row',alignItems:'center',gap:12}}>
              <div style={{fontSize:32}}>📍</div>
              <div>
                <h4 style={{fontFamily:"'Afrodotz','Brooklyn',serif",fontSize:18}}>
                  {isAr ? 'تعال وكسب طابعك' : 'Come in and earn your next stamp'}
                </h4>
                <p style={{fontSize:13,color:'#6A7290',marginTop:2}}>
                  {isAr ? 'مفتوحين ٩ص – منتصف الليل كل يوم' : 'Open 9AM – midnight, every day'}
                </p>
              </div>
            </div>

            <button className="btn ghost" onClick={() => { setCard(null); setPhone('') }} style={{border:'2.5px solid var(--ink)'}}>
              {isAr ? 'رجوع' : 'Look up another number'}
            </button>
          </div>
        )}
      </div>

      <footer className="m-footer" style={{marginTop:60}}>
        <Link to="/">noch.cloud</Link>
      </footer>
    </div>
  )
}
