import { useState } from 'react'
import { Link } from 'react-router-dom'
import PRODUCTS_RAW from '../data/bloomly-products.json'

const CATS = [
  { id: 'all',      label: 'All',           label_ar: 'الكل',          emoji: '✨' },
  { id: 'Hot',      label: 'Hot Drinks',     label_ar: 'مشروبات ساخنة', emoji: '☕' },
  { id: 'Cold',     label: 'Cold Drinks',    label_ar: 'مشروبات باردة', emoji: '🧊' },
  { id: 'Specialty',label: 'Specialty',      label_ar: 'مميزة',         emoji: '⭐' },
  { id: 'Boba',     label: 'Boba',           label_ar: 'بوبا',          emoji: '🧋' },
  { id: 'Ice Tea',  label: 'Ice Tea',        label_ar: 'آيس تي',        emoji: '🍹' },
  { id: 'Tea',      label: 'Tea',            label_ar: 'شاي',           emoji: '🫖' },
  { id: 'Foods',    label: 'Food',           label_ar: 'أكل',           emoji: '🥗' },
  { id: 'Retail',   label: 'Beans & Gear',   label_ar: 'حبوب وأدوات',   emoji: '☕' },
  { id: 'Tools',    label: 'Brewing Tools',  label_ar: 'أدوات تحضير',   emoji: '⚗️' },
]

// Filter out water/other noise, only show products with price > 0
const PRODUCTS = PRODUCTS_RAW.filter(p => p.price > 0 && p.category !== 'Water' && p.category !== 'Other')

export default function Shop({ lang = 'en' }) {
  const [active, setActive] = useState('all')
  const [query, setQuery] = useState('')
  const isAr = lang === 'ar'

  const filtered = PRODUCTS.filter(p =>
    (active === 'all' || p.category === active) &&
    (query === '' || p.name.toLowerCase().includes(query.toLowerCase()))
  )

  const activeCat = CATS.find(c => c.id === active)

  return (
    <div className={`menu-page${isAr ? ' rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <nav className="nav">
        <Link to="/" className="back">{isAr ? '→ رجوع' : '← Back'}</Link>
        <Link to="/" className="logo-sm">
          <img src="/assets/logo.svg" alt="Noch" style={{height:32}} />
        </Link>
      </nav>

      <section className="m-hero" style={{background:'radial-gradient(600px 300px at 20% 0%, #DCE9FF, transparent 60%), radial-gradient(600px 300px at 80% 100%, #C5E8B7, transparent 60%)'}}>
        <span className="kicker">✿ {isAr ? 'نوتش × بلوم' : 'noch × bloom'}</span>
        <h1>
          {isAr
            ? <><em>المتجر</em><br /><span className="underline">أونلاين</span></>
            : <>the <em>shop</em><br /><span className="underline">online</span></>
          }
        </h1>
        <p>{isAr
          ? `${PRODUCTS.length} منتج — حبوب قهوة، شاي، أدوات تحضير وأكثر.`
          : `${PRODUCTS.length} products — specialty beans, teas, brewing tools and more.`}
        </p>
        <img className="mascot" src="/assets/mascot-1.svg" alt="Nochi shopping" />
      </section>

      <div className="search-wrap">
        <div className="search">
          <span style={{fontSize:18}}>🔎</span>
          <input
            placeholder={isAr ? 'ابحث...' : 'search products...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="cats">
        {CATS.map(c => (
          <button key={c.id} className={'chip' + (active === c.id ? ' active' : '')} onClick={() => setActive(c.id)}>
            <span className="chip-emoji">{c.emoji}</span>
            {isAr ? c.label_ar : c.label}
          </button>
        ))}
      </div>

      <main className="grid-wrap">
        <div className="section-header">
          <h2>{isAr ? (activeCat?.label_ar || 'الكل') : (activeCat?.label || 'All')} <span className="dot">✦</span></h2>
          <span style={{ color: '#6A7290', fontSize: 14 }}>{filtered.length} {isAr ? 'منتج' : 'products'}</span>
        </div>
        <div className="grid">
          {filtered.map((p, idx) => (
            <article className="card shop-card" key={idx}>
              <div className="card-img-wrap">
                <img
                  src={p.img}
                  alt={p.name}
                  className="card-product-img"
                  loading="lazy"
                  crossOrigin="anonymous"
                  onError={e => {
                    e.target.style.display = 'none'
                    e.target.nextSibling.style.display = 'grid'
                  }}
                />
                <div className="card-illus-fallback" style={{display:'none'}}>☕</div>
              </div>
              <div className="card-head">
                <div className="card-name">{p.name}</div>
                <div className="price">{p.price.toFixed(3)}<span>LYD</span></div>
              </div>
              {p.description && <p className="card-desc">{p.description}</p>}
              <a
                href={`https://bloomly.odoo.com/shop`}
                target="_blank"
                rel="noreferrer"
                className="btn shop-btn"
              >
                {isAr ? 'اطلب →' : 'Order →'}
              </a>
            </article>
          ))}
          {filtered.length === 0 && (
            <p style={{ padding: 40, color: '#6A7290' }}>
              {isAr ? 'لا يوجد نتائج.' : 'Nothing found.'}
            </p>
          )}
        </div>
      </main>

      <section className="bottom">
        <h3>{isAr ? <>تسوّق عبر <em>بلوم</em></> : <>Shop via <em>Bloom</em></>}</h3>
        <p style={{ marginTop: 8, color: '#485070' }}>
          {isAr
            ? 'المتجر الإلكتروني مدار من بلوم. اضغط "اطلب" للذهاب للمتجر.'
            : 'Online store powered by Bloom Coffee. Tap "Order" to go to the product.'}
        </p>
        <div className="btn-row">
          <a className="btn" href="https://bloomly.odoo.com/shop" target="_blank" rel="noreferrer">
            {isAr ? 'زيارة المتجر الكامل →' : 'Visit full store →'}
          </a>
          <Link className="btn ghost" to="/">{isAr ? 'رجوع' : 'Back to hub'}</Link>
        </div>
      </section>

      <footer className="m-footer">
        {isAr ? 'الأسعار بالدينار الليبي · المتجر مدار من بلوم · ' : 'Prices in LYD · Powered by Bloom · '}
        <Link to="/">noch.cloud</Link>
      </footer>
    </div>
  )
}
