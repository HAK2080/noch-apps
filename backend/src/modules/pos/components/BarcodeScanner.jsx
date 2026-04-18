// BarcodeScanner.jsx — Camera-based QR & barcode scanner
// Uses @zxing/browser BrowserMultiFormatReader

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { X } from 'lucide-react'

export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    const startScan = async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        const deviceId = devices.find(d => /back|rear|environment/i.test(d.label))?.deviceId
          || devices[0]?.deviceId

        await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
          if (result) {
            setScanning(false)
            onScan(result.getText())
          }
          // Ignore scan errors — they happen continuously while scanning
        })
      } catch (err) {
        setError(err.message || 'Camera access denied')
      }
    }

    startScan()

    return () => {
      try { reader.reset() } catch { /* ignore */ }
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-noch-card rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-noch-border">
          <h2 className="text-white font-semibold">Scan Barcode / QR</h2>
          <button onClick={onClose} className="text-noch-muted hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {/* Camera view */}
        <div className="relative bg-black aspect-square">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted
          />
          {/* Scan frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-noch-green rounded-lg">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-noch-green rounded-tl-md" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-noch-green rounded-tr-md" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-noch-green rounded-bl-md" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-noch-green rounded-br-md" />
            </div>
          </div>
          {!scanning && (
            <div className="absolute inset-0 bg-noch-green/20 flex items-center justify-center">
              <span className="text-white text-2xl font-bold">✓</span>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="px-4 py-3 text-center">
          {error ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : scanning ? (
            <p className="text-noch-muted text-sm">Point camera at barcode or QR code</p>
          ) : (
            <p className="text-noch-green text-sm font-medium">Scanned!</p>
          )}
        </div>
      </div>
    </div>
  )
}
