// TableQRGenerator.jsx — Generate printable QR codes for dine-in tables
// Route: /pos/:branchId/tables

import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Printer } from 'lucide-react'
import QRCode from 'qrcode'

export default function TableQRGenerator() {
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  const [tableCount, setTableCount] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [qrDataUrls, setQrDataUrls] = useState({})
  const [generalQr, setGeneralQr] = useState(null)

  useEffect(() => {
    loadBranch()
  }, [branchId])

  useEffect(() => {
    generateQRCodes()
  }, [branchId, tableCount])

  async function loadBranch() {
    try {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('pos_branches')
        .select('*')
        .eq('id', branchId)
        .single()

      if (err) throw err
      setBranch(data)
      if (data.tables_count) {
        setTableCount(data.tables_count)
      }
    } catch (err) {
      console.error('Error loading branch:', err)
      setError(err.message || 'Failed to load branch')
    } finally {
      setLoading(false)
    }
  }

  async function generateQRCodes() {
    const host = window.location.origin
    const urls = {}
    for (let i = 1; i <= tableCount; i++) {
      const url = `${host}/menu/${branchId}?table=${i}`
      try {
        urls[i] = await QRCode.toDataURL(url, { width: 150, margin: 1 })
      } catch (e) {
        console.error('QR gen error for table', i, e)
      }
    }
    setQrDataUrls(urls)

    // Also generate a larger "general" menu QR (no table number) — for
    // posters, business cards, window stickers, social media bio links.
    try {
      const generalUrl = `${host}/menu/${branchId}`
      setGeneralQr(await QRCode.toDataURL(generalUrl, { width: 400, margin: 2 }))
    } catch (e) {
      console.error('General QR gen error', e)
    }
  }

  function downloadGeneralQr() {
    if (!generalQr) return
    const a = document.createElement('a')
    a.href = generalQr
    a.download = `noch-menu-${(branch?.name || 'branch').replace(/\s+/g, '-')}.png`
    a.click()
  }

  function getMenuUrl(tableNum) {
    const host = window.location.origin
    return `${host}/menu/${branchId}?table=${tableNum}`
  }

  if (loading) return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center">
      <p className="text-noch-muted">Loading...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center">
      <p className="text-red-400">{error}</p>
    </div>
  )

  const tables = Array.from({ length: tableCount }, (_, i) => i + 1)

  return (
    <div className="min-h-screen bg-noch-dark">
      {/* Header — hidden when printing */}
      <header className="print:hidden flex items-center gap-3 px-4 py-3 bg-noch-card border-b border-noch-border">
        <button
          onClick={() => navigate(`/pos/${branchId}/settings`)}
          className="text-noch-muted hover:text-white p-1"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold">Table QR Codes</h1>
          <p className="text-noch-muted text-sm">{branch?.name}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="btn btn-primary flex items-center gap-2"
        >
          <Printer size={16} />
          Print All
        </button>
      </header>

      {/* Controls — hidden when printing */}
      <div className="print:hidden px-4 py-4 border-b border-noch-border bg-noch-card">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-noch-muted text-sm">Number of tables:</label>
            <input
              type="number"
              min={1}
              max={100}
              value={tableCount}
              onChange={e => setTableCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="input w-20 text-center"
            />
          </div>
          <p className="text-noch-muted text-sm">
            Each QR links to: <code className="text-noch-green text-xs">/menu/{branchId}?table=N</code>
          </p>
          <button
            onClick={generateQRCodes}
            className="btn btn-secondary text-sm"
          >
            Regenerate
          </button>
        </div>
      </div>

      {/* Branch / Menu QR — single big QR for posters, stickers, business cards */}
      <div className="p-6 print:hidden border-b border-noch-border">
        <h2 className="text-white font-bold text-lg mb-2">Menu QR (no table)</h2>
        <p className="text-noch-muted text-sm mb-4">
          For window stickers, business cards, social bios. Link: {' '}
          <code className="text-noch-green text-xs">/menu/{branchId}</code>
        </p>
        <div className="flex items-center gap-6 flex-wrap">
          {generalQr && (
            <div className="bg-white p-4 rounded-xl flex flex-col items-center gap-2">
              <div className="text-gray-500 text-xs uppercase tracking-wide font-medium">
                {branch?.name}
              </div>
              <img src={generalQr} alt="Menu QR" width={200} height={200} className="rounded" />
              <div className="text-gray-700 text-sm font-semibold">Scan to order</div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button onClick={downloadGeneralQr} className="btn btn-primary text-sm">
              Download PNG
            </button>
            <a
              href={`${window.location.origin}/menu/${branchId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary text-sm text-center"
            >
              Open menu link
            </a>
            <p className="text-noch-muted text-xs max-w-xs">
              Print at any size — QR codes scale infinitely.
              For window stickers, 10×10 cm or larger is comfortable from 2 m away.
            </p>
          </div>
        </div>
      </div>

      {/* QR Grid */}
      <div className="p-6">
        {/* Print title */}
        <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-bold">{branch?.name}</h1>
          <p className="text-gray-500">Scan to order from your table</p>
        </div>

        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
        >
          {tables.map(tableNum => (
            <div
              key={tableNum}
              className="bg-white rounded-xl p-4 flex flex-col items-center gap-2 shadow-md print:shadow-none print:border print:border-gray-200 print:break-inside-avoid"
            >
              <div className="text-gray-500 text-xs uppercase tracking-wide font-medium">
                {branch?.name}
              </div>
              {qrDataUrls[tableNum] ? (
                <img
                  src={qrDataUrls[tableNum]}
                  alt={`QR code for table ${tableNum}`}
                  width={150}
                  height={150}
                  className="rounded"
                />
              ) : (
                <div className="w-[150px] h-[150px] bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
                  Generating...
                </div>
              )}
              <div className="text-center">
                <p className="text-gray-800 font-bold text-lg">Table {tableNum}</p>
                <p className="text-gray-400 text-xs">Scan to order</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:border { border: 1px solid #e5e7eb !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
