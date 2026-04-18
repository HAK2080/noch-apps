import { useEffect, useRef, useState } from 'react'
import { X, Camera, Loader } from 'lucide-react'

export default function QRScanner({ onScan, onClose }) {
  const divRef = useRef(null)
  const scannerRef = useRef(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let scanner = null
    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        scanner = new Html5Qrcode('qr-scanner-div')
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            onScan(decodedText)
            scanner.stop().catch(() => {})
          },
          () => {} // ignore errors during scan
        )
        setLoading(false)
      } catch (err) {
        setError(err.message || 'Camera not available')
        setLoading(false)
      }
    }
    startScanner()
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-noch-green" />
            <h3 className="text-white font-semibold">Scan Loyalty Card</h3>
          </div>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={20} /></button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader size={24} className="animate-spin text-noch-green" />
            <span className="text-noch-muted ml-2 text-sm">Starting camera...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <p className="text-noch-muted text-xs">Make sure the browser has camera permissions</p>
          </div>
        )}

        <div id="qr-scanner-div" className="w-full rounded-xl overflow-hidden" />

        <p className="text-noch-muted text-xs text-center mt-3">Point the camera at the customer's QR code</p>
      </div>
    </div>
  )
}
