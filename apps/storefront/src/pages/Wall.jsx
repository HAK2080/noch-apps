// Wall.jsx — public Nochi fan wall (Phase 7)
// Route: /wall  (HashRouter)
// Shows approved UGC submissions only. No customer phones, no IDs leaked.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Wall({ lang = 'ar' }) {
  const isAr = lang !== 'en'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('list_public_ugc', { p_limit: 60 })
        if (cancelled) return
        if (error) throw error
        setItems(data || [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'load_failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className={`menu-page${isAr ? ' rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <nav className="nav">
        <Link to="/" className="back">{isAr ? '→ الرئيسية' : '← Home'}</Link>
        <Link to="/" className="logo-sm">
          <img src="/assets/logo.svg" alt="Noch" style={{ height: 32 }} />
        </Link>
        <div />
      </nav>

      <section className="m-hero" style={{ background: 'linear-gradient(140deg,#1A1A2E,#0B1020)', color: '#fff', paddingBottom: 50 }}>
        <span className="kicker" style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#FFD700' }}>
          📸 {isAr ? 'جدار نوتشي' : 'Nochi Fan Wall'}
        </span>
        <h1 style={{ color: '#fff' }}>
          {isAr ? <>صور <em style={{ color: 'var(--orange)' }}>زبائننا</em></> : <>Photos by <em style={{ color: 'var(--orange)' }}>our regulars</em></>}
        </h1>
        <p style={{ color: 'rgba(255,255,255,.7)' }}>
          {isAr
            ? 'كل صورة هنا منشورة بموافقة صاحبها 🐰'
            : 'Every photo here was shared with explicit consent 🐰'}
        </p>
      </section>

      <div style={{ maxWidth: 960, margin: '24px auto', padding: '0 16px' }}>
        {loading && <p style={{ textAlign: 'center', opacity: 0.6 }}>…</p>}
        {error && <p style={{ textAlign: 'center', color: '#e63946' }}>{isAr ? 'تعذر التحميل' : "Couldn't load the wall"}</p>}
        {!loading && !error && items.length === 0 && (
          <div className="card" style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center', padding: 24 }}>
            <p style={{ margin: 0 }}>{isAr ? 'لا توجد صور بعد. كن أول واحد!' : 'No photos yet — be the first to share.'}</p>
            <Link to="/loyalty" className="btn" style={{ marginTop: 12, display: 'inline-block', padding: '8px 16px', textDecoration: 'none' }}>
              {isAr ? 'افتح بطاقتي' : 'Open my pass'}
            </Link>
          </div>
        )}

        {items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {items.map(it => (
              <WallCard key={it.id} item={it} isAr={isAr} />
            ))}
          </div>
        )}
      </div>

      <footer className="m-footer" style={{ marginTop: 60 }}>
        <Link to="/">noch.cloud</Link>
      </footer>
    </div>
  )
}

function WallCard({ item, isAr }) {
  const credit = item.display_name
    || (item.handle ? `@${item.handle.replace(/^@/, '')}` : null)
  return (
    <article style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ aspectRatio: '1 / 1', background: '#1a1a2e', position: 'relative' }}>
        <img
          src={item.photo_url}
          alt={item.caption || 'Nochi customer'}
          loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      </div>
      <div style={{ padding: '8px 10px' }}>
        {item.caption && <p style={{ fontSize: 13, margin: '0 0 4px', lineHeight: 1.35 }}>{item.caption}</p>}
        {credit && <p style={{ fontSize: 12, margin: 0, opacity: 0.65 }} dir="ltr">— {credit}</p>}
      </div>
    </article>
  )
}
