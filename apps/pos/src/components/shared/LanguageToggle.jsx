import { useLanguage } from '../../contexts/LanguageContext'

export default function LanguageToggle({ className = '', variant = 'compact' }) {
  const { lang, setLang, toggleLang } = useLanguage()
  if (variant === 'staff') {
    return (
      <div className={`skin-language-toggle ${className}`} role="group" aria-label="Language">
        <button type="button" onClick={() => setLang('en')} aria-pressed={lang === 'en'}>EN</button>
        <button type="button" onClick={() => setLang('ar')} aria-pressed={lang === 'ar'} lang="ar">عربي</button>
      </div>
    )
  }
  return (
    <button
      onClick={toggleLang}
      aria-label={lang === 'ar' ? 'Switch to English' : 'Switch to Arabic'}
      title={lang === 'ar' ? 'English' : 'العربية'}
      className={`text-sm font-semibold text-noch-muted hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-noch-border ${className}`}
    >
      {lang === 'ar' ? 'EN' : 'ع'}
    </button>
  )
}
