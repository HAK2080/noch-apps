import { useState, useEffect, lazy, Suspense } from 'react'
import { QrCode, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { lookupCustomerByPassportToken } from '../../loyalty/lib/loyalty-supabase'
import toast from 'react-hot-toast'

const QRScanner = lazy(() => import('./QRScanner'))

export default function CustomerSearchModal({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showScan, setShowScan] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('loyalty_customers')
          .select('id, full_name, phone, tier, current_stamps, total_visits, nochi_state, passport_token')
          .or(`phone.ilike.%${q}%,full_name.ilike.%${q}%`)
          .order('last_visit_at', { ascending: false, nullsFirst: false })
          .limit(8)
        if (!cancelled && !error) setResults(data || [])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  const handleScan = async (raw) => {
    setShowScan(false)
    // Accept either a bare uuid or our prefixed form. Strip prefix and
    // anything after a slash.
    let token = String(raw || '').trim()
    const m = token.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (m) token = m[0]
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      toast.error("Couldn't read that code")
      return
    }
    try {
      const c = await lookupCustomerByPassportToken(token)
      if (!c) { toast.error('No customer matches this code'); return }
      onSelect(c)
    } catch (err) {
      toast.error(err.message || 'Lookup failed')
    }
  }

  return (
    <>
      {showScan && (
        <Suspense fallback={null}>
          <QRScanner onScan={handleScan} onClose={() => setShowScan(false)} />
        </Suspense>
      )}
      <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-20" onClick={onClose}>
        <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-noch-border">
            <h3 className="text-white font-bold">Attach customer</h3>
            <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
          </div>
          <div className="p-4">
            <button
              onClick={() => setShowScan(true)}
              className="w-full flex items-center justify-center gap-2 mb-3 py-2.5 rounded-xl border border-noch-green/40 text-noch-green hover:bg-noch-green/10 text-sm font-medium transition-colors"
            >
              <QrCode size={16} />
              Scan customer’s Pass code
            </button>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-noch-border" />
              <span className="text-noch-muted text-[11px] uppercase tracking-wider">or search</span>
              <div className="flex-1 h-px bg-noch-border" />
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Phone or name..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="input w-full mb-3"
            />
            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {searching && <p className="text-noch-muted text-xs px-2 py-1">Searching…</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-noch-muted text-sm px-2 py-2">No matches.</p>
              )}
              {results.map(c => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="text-left px-3 py-2 rounded-lg hover:bg-noch-green/10 border border-transparent hover:border-noch-green/30"
                >
                  <p className="text-white text-sm font-medium">{c.full_name}</p>
                  <p className="text-noch-muted text-xs">
                    {c.phone} · {c.tier} · {c.current_stamps ?? 0} stamps · {c.total_visits ?? 0} visits
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
