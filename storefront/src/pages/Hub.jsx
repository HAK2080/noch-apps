import { useState } from 'react'
import { Link } from 'react-router-dom'

const T = {
  en: {
    loyalty: 'Nochi App',
    loyaltySub: 'Loyalty · Freebies',
    wave: "Hey — I'm Nochi. What can I get you?",
    h1a: 'Menu,', h1b: 'location,', h1c: 'shop', h1d: 'all here.',
    sub: "We got tired of the 'where are you?' DMs. So here's literally everything — menu, map, shop and your rewards. Go on, tap something.",
    menuKicker: 'Most asked', menuTitle: 'The menu', menuDesc: "Everything we're brewing, baking & plating — live from our kitchen.",
    locKicker: 'Find us', locTitle: 'Where we are', locDesc: 'Open 9AM – midnight. Drop by — Nochi will be here.',
    shopKicker: 'Buy online', shopTitle: 'The shop', shopDesc: 'Specialty beans, brewing gear and a few nice things to take home.',
    loyaltyKicker: 'Your rewards', loyaltyTitle: 'Loyalty card', loyaltyDesc: 'Check your stamps, claim your freebies and see what Nochi has saved for you.',
    loyaltyBtn: 'Open my card →',
    prestoKicker: 'Fast orders', prestoTitle: 'Presto', prestoDesc: 'Lightning-fast ordering. Coming soon.',
    marquee: 'Fresh beans ✦ Sweet Matcha ✦ warm pastries ✦ real smile ✦ tripoli made',
    hoursTitle: 'Open today', hoursVal: '9:00 AM – 12:00 AM · Every day',
    talkTitle: 'Talk to us', talkVal: '+218 94 698 7558',
    footerTagline: 'A little corner of Tripoli where coffee, matcha and good company meet. See you soon.',
    visit: 'Visit', follow: 'Follow',
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    menu: 'Menu', location: 'Location', shop: 'Shop',
    madeIn: '© 2026 Noch. Made in Tripoli.',
    staff: 'Staff',
  },
  ar: {
    loyalty: 'تطبيق نوتشي',
    loyaltySub: 'الولاء · هدايا مجانية',
    wave: 'مرحبا — أنا نوتشي. شو تحتاج؟',
    h1a: 'القائمة،', h1b: 'الموقع،', h1c: 'المتجر', h1d: 'كلها هنا.',
    sub: 'تعبنا من رسائل "وين نتوا؟". حطينا كل شي هنا — القائمة، الخريطة، المتجر، ونقاطك. اضغط على أي شيء.',
    menuKicker: 'الأكثر طلباً', menuTitle: 'القائمة', menuDesc: 'كل مشروباتنا ومعجناتنا — مباشرة من المطبخ.',
    locKicker: 'زورنا', locTitle: 'وين نحنا', locDesc: 'مفتوحين ٩ص – منتصف الليل. تعال — نوتشي في انتظارك.',
    shopKicker: 'تسوّق', shopTitle: 'المتجر', shopDesc: 'حبوب قهوة، أدوات تحضير، وأشياء جميلة تاخذها معك.',
    loyaltyKicker: 'مكافآتك', loyaltyTitle: 'بطاقة الولاء', loyaltyDesc: 'اشوف طوابعك، احصل على هداياك المجانية، وشوف شو حضّر لك نوتشي.',
    loyaltyBtn: 'افتح بطاقتي ←',
    prestoKicker: 'طلبات سريعة', prestoTitle: 'بريستو', prestoDesc: 'تجربة طلب سريعة البرق. قريباً.',
    marquee: 'حبوب طازجة ✦ ماتشا حلوة ✦ معجنات دافئة ✦ ابتسامة حقيقية ✦ صنعة طرابلس',
    hoursTitle: 'اليوم مفتوحين', hoursVal: '٩:٠٠ صباحاً – ١٢:٠٠ منتصف الليل',
    talkTitle: 'تواصل معنا', talkVal: '‎+218 94 698 7558',
    footerTagline: 'زاوية صغيرة في طرابلس تجمع القهوة والماتشا والرفقة الحلوة. نشوفكم.',
    visit: 'تصفّح', follow: 'تابعنا',
    instagram: 'إنستغرام', facebook: 'فيسبوك', tiktok: 'تيكتوك',
    menu: 'القائمة', location: 'الموقع', shop: 'المتجر',
    madeIn: '© 2026 نوتش. صنعة طرابلس.',
    staff: 'الموظفون',
  },
}

export default function Hub() {
  const [lang, setLang] = useState('en')
  const t = T[lang]
  const isAr = lang === 'ar'

  return (
    <div className={`hub-page${isAr ? ' rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      <header className="topbar">
        <Link to="/" className="logo">
          <img src="/assets/logo.svg" alt="Noch" className="logo-img" />
        </Link>
        <div className="topbar-right">
          <button className="lang-toggle" onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}>
            {lang === 'en' ? 'العربية' : 'English'}
          </button>
          <a href="https://apps.noch.cloud/loyalty" className="loyalty-chip">
            <span className="dot"></span>
            <span>
              <span className="loyalty-title">{t.loyalty}</span>
              <span className="loyalty-sub">{t.loyaltySub}</span>
            </span>
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="wave">
          <img src="/assets/mascot-1.svg" className="mascot-mini" alt="Nochi" />
          {t.wave}
        </div>
        <h1 className="h1">
          {t.h1a} <em>{t.h1b}</em><br />
          {t.h1c} — <span className="pill">{t.h1d}</span>
        </h1>
        <p className="subhead">{t.sub}</p>
      </section>

      <main className="hub">
        {/* Row 1: Menu + Location */}
        <Link className="tile tile-menu" to="/menu">
          <div>
            <div className="tile-kicker">{t.menuKicker}</div>
            <div className="tile-title">{t.menuTitle}</div>
            <p className="tile-desc">{t.menuDesc}</p>
          </div>
          <div className="tile-arrow">→</div>
          <img className="tile-mascot" src="/assets/mascot-2.svg" alt="Nochi with menu" />
        </Link>

        <a className="tile tile-location" href="https://maps.app.goo.gl/Aygj2WyqPTf85ezz9" target="_blank" rel="noreferrer">
          <div>
            <div className="tile-kicker">{t.locKicker}</div>
            <div className="tile-title">{t.locTitle}</div>
            <p className="tile-desc">{t.locDesc}</p>
          </div>
          <div className="tile-arrow">→</div>
          <img className="tile-mascot" src="/assets/mascot-3.svg" alt="Nochi on map" />
        </a>

        {/* Row 2: Loyalty — full width */}
        <Link className="tile tile-loyalty" to="/loyalty">
          <img className="tile-mascot" src="/assets/mascot-1.svg" alt="Nochi loyalty" style={{position:'static',width:140,flexShrink:0}} />
          <div style={{flex:1}}>
            <div className="tile-kicker" style={{opacity:.6}}>{t.loyaltyKicker}</div>
            <div className="tile-title">{t.loyaltyTitle}</div>
            <p className="tile-desc">{t.loyaltyDesc}</p>
            <div className="loyalty-stars">⭐⭐⭐⭐⭐</div>
          </div>
          <div className="tile-arrow" style={{position:'static',flexShrink:0}}>→</div>
        </Link>

        {/* Row 3: Shop + Presto */}
        <Link className="tile tile-shop" to="/shop">
          <div>
            <div className="tile-kicker">{t.shopKicker}</div>
            <div className="tile-title">{t.shopTitle}</div>
            <p className="tile-desc">{t.shopDesc}</p>
          </div>
          <div className="tile-arrow">→</div>
          <img className="tile-mascot" src="/assets/mascot-1.svg" alt="Nochi shopping" />
        </Link>

        <a className="tile tile-presto" href="#presto">
          <div>
            <div className="tile-kicker">{t.prestoKicker}</div>
            <div className="tile-title">{t.prestoTitle}</div>
            <p className="tile-desc">{t.prestoDesc}</p>
            <span className="badge">Coming soon</span>
          </div>
          <div className="tile-arrow">→</div>
          <img className="tile-mascot tile-mascot-presto" src="/assets/presto.svg" alt="Presto" />
        </a>
      </main>

      <div className="marquee">
        <div className="marquee-track">
          <span>{t.marquee} ✦</span>
          <span>{t.marquee} ✦</span>
        </div>
      </div>

      <section className="strip">
        <div className="strip-card">
          <div className="strip-icon hours">⏰</div>
          <div>
            <h4>{t.hoursTitle}</h4>
            <p>{t.hoursVal}</p>
          </div>
        </div>
        <div className="strip-card">
          <div className="strip-icon phone">📞</div>
          <div>
            <h4>{t.talkTitle}</h4>
            <p><a href="tel:+218946987558" style={{color:'inherit',fontWeight:700}}>{t.talkVal}</a></p>
            <p style={{marginTop:4,fontSize:13}}>
              <a href="https://www.facebook.com/profile.php?id=61575489929142" target="_blank" rel="noreferrer" style={{color:'var(--blue)',fontWeight:600}}>Facebook</a>
              {' · '}
              <a href="https://www.instagram.com/noch.cafe" target="_blank" rel="noreferrer" style={{color:'var(--pink)',fontWeight:600}}>Instagram</a>
            </p>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="foot-grid">
          <div>
            <div className="foot-logo">
              <img src="/assets/logo.svg" alt="Noch" style={{height:44,filter:'brightness(0) invert(1)'}} />
            </div>
            <p style={{ marginTop: 12, color: '#A5ADC4', maxWidth: 380 }}>{t.footerTagline}</p>
          </div>
          <div>
            <h5>{t.visit}</h5>
            <Link to="/menu">{t.menu}</Link>
            <a href="https://maps.app.goo.gl/Aygj2WyqPTf85ezz9" target="_blank" rel="noreferrer">{t.location}</a>
            <Link to="/shop">{t.shop}</Link>
          </div>
          <div>
            <h5>{t.follow}</h5>
            <a href="https://www.instagram.com/noch.cafe" target="_blank" rel="noreferrer">{t.instagram}</a>
            <a href="https://www.facebook.com/profile.php?id=61575489929142" target="_blank" rel="noreferrer">{t.facebook}</a>
            <a href="#">{t.tiktok}</a>
          </div>
        </div>
        <div className="fine">
          <span>{t.madeIn}</span>
          <span>{t.staff} · <a href="https://apps.noch.cloud" style={{ color: 'var(--orange)', display: 'inline' }}>apps.noch.cloud</a></span>
        </div>
      </footer>
    </div>
  )
}
