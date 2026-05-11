import { useState, useEffect } from 'react'
import { Bluetooth, USB, Printer, Check, AlertCircle, Loader2 } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { detectPrinterCapability, PrinterQueue, Receipt, createSampleReceipt } from '../lib/printer'
import toast from 'react-hot-toast'

export default function PrinterSettings() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const [capabilities, setCapabilities] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [queue] = useState(new PrinterQueue())
  const [queueStatus, setQueueStatus] = useState(null)
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(false)

  // Detect capabilities on mount
  useEffect(() => {
    ;(async () => {
      const caps = await detectPrinterCapability()
      setCapabilities(caps)
      // Load saved connection preference from localStorage
      const saved = localStorage.getItem('printer_connection')
      if (saved && (saved === 'bluetooth' ? caps.bluetooth : caps.usb)) {
        setSelectedConnection(saved)
      }
    })()
  }, [])

  // Monitor queue status
  useEffect(() => {
    const interval = setInterval(() => {
      setQueueStatus(queue.getStatus())
    }, 500)
    return () => clearInterval(interval)
  }, [queue])

  const handleConnect = async (type) => {
    setLoading(true)
    try {
      const connected =
        type === 'bluetooth' ? await queue.connectBluetooth() : await queue.connectUSB()

      if (connected) {
        setSelectedConnection(type)
        setConnectionStatus('connected')
        localStorage.setItem('printer_connection', type)
        toast.success(ar ? 'متصل بالطابعة' : 'Printer connected')
      } else {
        setConnectionStatus('disconnected')
        toast.error(ar ? 'فشل الاتصال' : 'Connection failed')
      }
    } catch (error) {
      console.error(error)
      toast.error(error.message || 'Connection error')
    } finally {
      setLoading(false)
    }
  }

  const handleTestPrint = async () => {
    if (!queue.isConnected) {
      toast.error(ar ? 'لم تتصل بالطابعة' : 'Printer not connected')
      return
    }

    setTesting(true)
    try {
      const receipt = createSampleReceipt()
      queue.enqueue(receipt)
      await queue.printQueue()
      toast.success(ar ? 'تم الطباعة بنجاح' : 'Print successful')
    } catch (error) {
      console.error(error)
      toast.error(error.message || 'Print failed')
    } finally {
      setTesting(false)
    }
  }

  const handleOpenCashDrawer = async () => {
    if (!queue.isConnected) {
      toast.error(ar ? 'لم تتصل بالطابعة' : 'Printer not connected')
      return
    }

    setTesting(true)
    try {
      const receipt = new Receipt()
      receipt.reset().openCashDrawer()
      queue.enqueue(receipt)
      await queue.printQueue()
      toast.success(ar ? 'تم فتح الدرج' : 'Cash drawer opened')
    } catch (error) {
      console.error(error)
      toast.error(error.message || 'Cash drawer failed')
    } finally {
      setTesting(false)
    }
  }

  if (!capabilities) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Device Capabilities */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-white">
          {ar ? 'إمكانيات الجهاز' : 'Device Capabilities'}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-zinc-400">
            <div className={`w-2 h-2 rounded-full ${capabilities.platformOS ? 'bg-green-500' : 'bg-red-500'}`} />
            {ar ? 'النظام الأساسي' : 'Platform'}: <span className="text-white capitalize">{capabilities.platformOS}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Bluetooth size={16} className={capabilities.bluetooth ? 'text-green-500' : 'text-red-500'} />
            {ar ? 'بلوتوث' : 'Bluetooth'}: <span className="text-white">{capabilities.bluetooth ? 'Available' : 'Not available'}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <USB size={16} className={capabilities.usb ? 'text-green-500' : 'text-red-500'} />
            {ar ? 'يو اس بي' : 'USB'}: <span className="text-white">{capabilities.usb ? 'Available' : 'Not available'}</span>
          </div>
        </div>
      </div>

      {/* Connection Options */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-white">
          {ar ? 'اتصال الطابعة' : 'Printer Connection'}
        </h3>

        {/* Status */}
        <div className="mb-4 p-3 rounded-lg bg-zinc-800 flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="text-sm text-zinc-300">
            {connectionStatus === 'connected'
              ? ar
                ? 'متصل بـ ' + selectedConnection
                : 'Connected via ' + selectedConnection
              : ar
                ? 'غير متصل'
                : 'Disconnected'}
          </span>
        </div>

        {/* Connection Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleConnect('bluetooth')}
            disabled={!capabilities.bluetooth || loading || connectionStatus === 'connected'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading && selectedConnection === 'bluetooth' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Bluetooth size={16} />
            )}
            {ar ? 'بلوتوث' : 'Bluetooth'}
          </button>
          <button
            onClick={() => handleConnect('usb')}
            disabled={!capabilities.usb || loading || connectionStatus === 'connected'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading && selectedConnection === 'usb' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <USB size={16} />
            )}
            {ar ? 'يو اس بي' : 'USB'}
          </button>
        </div>
      </div>

      {/* Test & Controls */}
      {connectionStatus === 'connected' && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 text-white">
            {ar ? 'الاختبار' : 'Test Print'}
          </h3>
          <div className="space-y-3">
            <button
              onClick={handleTestPrint}
              disabled={testing}
              className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Printer size={16} />
              )}
              {ar ? 'طباعة اختبار' : 'Test Print'}
            </button>
            <button
              onClick={handleOpenCashDrawer}
              disabled={testing}
              className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              {ar ? 'فتح الدرج' : 'Open Cash Drawer'}
            </button>
          </div>

          {/* Queue Status */}
          {queueStatus && queueStatus.total > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-zinc-800 text-xs text-zinc-300">
              <div className="grid grid-cols-2 gap-2">
                <div>{ar ? 'المعلقة' : 'Pending'}: {queueStatus.pending}</div>
                <div>{ar ? 'المطبوعة' : 'Printed'}: {queueStatus.printed}</div>
                <div>{ar ? 'الفاشلة' : 'Failed'}: {queueStatus.failed}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      {!connectionStatus || connectionStatus === 'disconnected' && (
        <div className="card bg-blue-900/30 border border-blue-700">
          <div className="flex gap-3">
            <AlertCircle size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">
                {ar ? 'نصيحة الإعداد' : 'Setup Tip'}
              </p>
              <p className="text-blue-100">
                {ar
                  ? 'تأكد من إقران طابعة Xprinter XP-58IIHV بجهازك قبل الاتصال. للهواتف الذكية، تحقق من صلاحيات البلوتوث.'
                  : 'Ensure your Xprinter XP-58IIHV is paired with your device before connecting. On mobile, check Bluetooth permissions.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
