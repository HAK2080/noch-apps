import { useEffect, useState } from 'react'
import { listBusinesses } from '../services/businesses'
import { SELECTED_BUSINESS_KEY } from '../lib/constants'

export function useSelectedBusiness() {
  const [businesses, setBusinesses] = useState([])
  const [businessId, setBusinessIdState] = useState(() => localStorage.getItem(SELECTED_BUSINESS_KEY) || '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listBusinesses().then(rows => {
      if (!alive) return
      setBusinesses(rows)
      if (!businessId && rows.length) {
        setBusinessIdState(rows[0].id)
        localStorage.setItem(SELECTED_BUSINESS_KEY, rows[0].id)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setBusinessId(id) {
    setBusinessIdState(id)
    if (id) localStorage.setItem(SELECTED_BUSINESS_KEY, id)
    else localStorage.removeItem(SELECTED_BUSINESS_KEY)
  }

  return { businesses, businessId, setBusinessId, loading }
}

export default function BusinessSelector({ value, onChange, businesses }) {
  if (!businesses?.length) return null
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className="bg-noch-card border border-noch-border text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-noch-green"
    >
      {businesses.map(b => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  )
}
