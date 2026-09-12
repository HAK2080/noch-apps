import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { LanguageProvider } from '../../src/contexts/LanguageContext'
import POSHome from '../../src/modules/pos/pages/POSHome'
import POSEndOfDay from '../../src/modules/pos/pages/POSEndOfDay'
import '../../src/index.css'
localStorage.setItem('pos-tile-lang','en')
localStorage.setItem('noch_lang','en')
createRoot(document.getElementById('root')).render(<LanguageProvider><MemoryRouter initialEntries={[location.search.includes('close') ? '/pos/test/end-of-day' : '/pos']}><Toaster/><Routes><Route path="/pos" element={<POSHome/>}/><Route path="/pos/test" element={<p>Terminal ready</p>}/><Route path="/pos/:branchId/end-of-day" element={<POSEndOfDay/>}/></Routes></MemoryRouter></LanguageProvider>)
