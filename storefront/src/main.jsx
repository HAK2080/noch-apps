import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Hub from './pages/Hub.jsx'
import Menu from './pages/Menu.jsx'
import Shop from './pages/Shop.jsx'
import Loyalty from './pages/Loyalty.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Hub />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/loyalty" element={<Loyalty />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
)
