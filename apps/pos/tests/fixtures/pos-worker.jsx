import { useState } from 'react'
import ProductGrid from '../../src/modules/pos/components/ProductGrid'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { LanguageProvider } from '../../src/contexts/LanguageContext'
import POSHome from '../../src/modules/pos/pages/POSHome'
import POSEndOfDay from '../../src/modules/pos/pages/POSEndOfDay'
import '../../src/index.css'
localStorage.setItem('pos-tile-lang','en')
localStorage.setItem('noch_lang','en')
// eslint-disable-next-line react-refresh/only-export-components
function MenuPreview() {
  const [query,setQuery]=useState('')
  const [count,setCount]=useState(0)
  return <main dir="rtl" className="h-screen bg-noch-dark p-4 flex flex-col"><input aria-label="بحث" className="input mb-3" value={query} onChange={e=>setQuery(e.target.value)}/><p className="text-white">السلة: {count}</p><ProductGrid tileLang="ar" searchQuery={query} onSelect={()=>setCount(n=>n+1)} products={[
    {id:'water',name:'Water',name_ar:'ماء',price:1},
    {id:'cappuccino',name:'Cappuccino',name_ar:'كابتشينو',price:15},
    {id:'matcha',name:'Classic Matcha Latte',name_ar:'ماتشا لاتيه كلاسيك',price:30},
    {id:'v60',name:'V60 Specialty Coffee',name_ar:'V60 - بارد - بالقهوة المختصة',price:16},
    {id:'cake',name:'London Cake',name_ar:'لندن كيك',price:35,is_sold_out:true},
    {id:'latte',name:'Iced Vanilla Latte',name_ar:'لاتيه فانيليا بارد',price:23},
  ]}/></main>
}
createRoot(document.getElementById('root')).render(location.search.includes('menu') ? <MenuPreview/> : <LanguageProvider><MemoryRouter initialEntries={[location.search.includes('close') ? '/pos/test/end-of-day' : '/pos']}><Toaster/><Routes><Route path="/pos" element={<POSHome/>}/><Route path="/pos/test" element={<p>Terminal ready</p>}/><Route path="/pos/:branchId/end-of-day" element={<POSEndOfDay/>}/></Routes></MemoryRouter></LanguageProvider>)
