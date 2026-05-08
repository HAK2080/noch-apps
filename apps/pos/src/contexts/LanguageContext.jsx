import { createContext, useContext, useEffect, useState } from 'react'
import { translations } from '../lib/i18n'

const LanguageContext = createContext({})

export function useLanguage() {
  return useContext(LanguageContext)
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('noch_lang') || 'en')

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
    localStorage.setItem('noch_lang', lang)
  }, [lang])

  const toggleLang = () => setLang(l => l === 'ar' ? 'en' : 'ar')

  const t = (key) => translations[lang]?.[key] || translations['en']?.[key] || key

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}
