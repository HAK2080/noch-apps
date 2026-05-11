/**
 * ESC/POS Command Builder for Xprinter XP-58IIHV
 * 58mm thermal printer, 90mm/s print speed
 * Supports: Bluetooth, USB, Serial
 */

// ============================================================
// ESC/POS COMMAND CONSTANTS
// ============================================================

export const ESC_POS = {
  // Line spacing & formatting
  LF: new Uint8Array([0x0A]),                    // Line feed
  CR: new Uint8Array([0x0D]),                    // Carriage return
  ESC: new Uint8Array([0x1B]),                   // Escape
  GS: new Uint8Array([0x1D]),                    // Group separator

  // Reset
  RESET: new Uint8Array([0x1B, 0x40]),           // ESC @ — reset printer

  // Text styling
  BOLD_ON: new Uint8Array([0x1B, 0x45, 0x01]),  // ESC E 1 — bold on
  BOLD_OFF: new Uint8Array([0x1B, 0x45, 0x00]), // ESC E 0 — bold off
  UNDERLINE_ON: new Uint8Array([0x1B, 0x2D, 0x01]),   // ESC - 1 — underline on
  UNDERLINE_OFF: new Uint8Array([0x1B, 0x2D, 0x00]),  // ESC - 0 — underline off

  // Font size
  FONT_SIZE_NORMAL: new Uint8Array([0x1B, 0x4D, 0x00]),  // ESC M 0 — font A (12x24)
  FONT_SIZE_LARGE: new Uint8Array([0x1D, 0x21, 0x11]),   // GS ! 17 — 2x height & width

  // Alignment
  ALIGN_LEFT: new Uint8Array([0x1B, 0x61, 0x00]),   // ESC a 0 — left align
  ALIGN_CENTER: new Uint8Array([0x1B, 0x61, 0x01]), // ESC a 1 — center align
  ALIGN_RIGHT: new Uint8Array([0x1B, 0x61, 0x02]),  // ESC a 2 — right align

  // Line drawing (box)
  BOX_HORIZONTAL: '─', // UTF-8 box drawing
  BOX_VERTICAL: '│',
  BOX_TL: '┌',
  BOX_TR: '┐',
  BOX_BL: '└',
  BOX_BR: '┘',

  // Cut paper
  CUT_PARTIAL: new Uint8Array([0x1B, 0x69]),     // ESC i — partial cut
  CUT_FULL: new Uint8Array([0x1B, 0x6D]),        // ESC m — full cut

  // Cash drawer (for Xprinter)
  CASH_DRAWER: new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]), // ESC p 0 25 250 — pulse 12V 100ms
}

// ============================================================
// BLUETOOTH/USB DETECTION
// ============================================================

export async function detectPrinterCapability() {
  const capabilities = {
    bluetooth: false,
    usb: false,
    serial: false,
    platformOS: 'unknown',
  }

  // Detect OS
  if (typeof window !== 'undefined' && window.navigator) {
    const ua = window.navigator.userAgent.toLowerCase()
    if (ua.includes('android')) {
      capabilities.platformOS = 'android'
    } else if (ua.includes('iphone') || ua.includes('ipad')) {
      capabilities.platformOS = 'ios'
    } else if (ua.includes('windows')) {
      capabilities.platformOS = 'windows'
    } else if (ua.includes('mac')) {
      capabilities.platformOS = 'macos'
    } else if (ua.includes('linux')) {
      capabilities.platformOS = 'linux'
    }
  }

  // Android: Check for Bluetooth permission + Web Bluetooth API
  if (typeof navigator !== 'undefined') {
    // Web Bluetooth API
    if (navigator.bluetooth) {
      capabilities.bluetooth = true
    }

    // Web Serial API (USB)
    if (navigator.serial) {
      capabilities.usb = true
    }

    // Android: Additional Bluetooth check
    if (capabilities.platformOS === 'android' && typeof window !== 'undefined') {
      // This would require Android native bridge or Bluetooth Web API
      capabilities.bluetooth = navigator.bluetooth ? true : false
    }
  }

  return capabilities
}

// ============================================================
// RECEIPT BUILDING
// ============================================================

export class Receipt {
  constructor(width = 42) {
    this.width = width  // 58mm ÷ 1.4 ≈ 42 characters
    this.commands = []
  }

  // Add command
  add(command) {
    if (typeof command === 'string') {
      this.commands.push(new TextEncoder().encode(command + '\n'))
    } else if (command instanceof Uint8Array) {
      this.commands.push(command)
    }
    return this
  }

  // Reset printer
  reset() {
    this.commands.push(ESC_POS.RESET)
    return this
  }

  // Text formatting
  text(str, options = {}) {
    const { align = 'left', bold = false, size = 'normal', underline = false } = options

    // Alignment
    if (align === 'center') this.commands.push(ESC_POS.ALIGN_CENTER)
    else if (align === 'right') this.commands.push(ESC_POS.ALIGN_RIGHT)
    else this.commands.push(ESC_POS.ALIGN_LEFT)

    // Bold
    if (bold) this.commands.push(ESC_POS.BOLD_ON)

    // Size
    if (size === 'large') this.commands.push(ESC_POS.FONT_SIZE_LARGE)
    else this.commands.push(ESC_POS.FONT_SIZE_NORMAL)

    // Underline
    if (underline) this.commands.push(ESC_POS.UNDERLINE_ON)

    // Text
    this.add(str)

    // Reset formatting
    if (bold) this.commands.push(ESC_POS.BOLD_OFF)
    if (underline) this.commands.push(ESC_POS.UNDERLINE_OFF)

    // Reset to left align
    this.commands.push(ESC_POS.ALIGN_LEFT)

    return this
  }

  // Line
  line(char = '─') {
    this.add(char.repeat(this.width))
    return this
  }

  // Newline
  newline(count = 1) {
    for (let i = 0; i < count; i++) {
      this.commands.push(ESC_POS.LF)
    }
    return this
  }

  // Blank lines (vertical spacing)
  spacing(lines = 1) {
    for (let i = 0; i < lines; i++) {
      this.add('')
    }
    return this
  }

  // Table row (aligned columns)
  row(columns, align = 'left') {
    // Simple 2-column layout
    if (columns.length === 2) {
      const colWidth = Math.floor(this.width / 2)
      const left = String(columns[0]).padEnd(colWidth)
      const right = String(columns[1]).padStart(colWidth)
      this.add(left + right)
    } else {
      // Fallback: simple spacing
      this.add(columns.join('  '))
    }
    return this
  }

  // Cut paper
  cut(partial = false) {
    this.commands.push(partial ? ESC_POS.CUT_PARTIAL : ESC_POS.CUT_FULL)
    return this
  }

  // Open cash drawer
  openCashDrawer() {
    this.commands.push(ESC_POS.CASH_DRAWER)
    return this
  }

  // Get binary data
  toBlob() {
    const totalLength = this.commands.reduce((sum, cmd) => sum + cmd.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const cmd of this.commands) {
      result.set(cmd, offset)
      offset += cmd.length
    }
    return new Blob([result], { type: 'application/octet-stream' })
  }

  // Get as array buffer (for WebBluetooth, WebSerial)
  toArrayBuffer() {
    const totalLength = this.commands.reduce((sum, cmd) => sum + cmd.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const cmd of this.commands) {
      result.set(cmd, offset)
      offset += cmd.length
    }
    return result.buffer
  }

  // Debug: Get as string (for testing)
  toString() {
    return this.commands
      .map(cmd => {
        if (cmd.every(b => b >= 32 && b <= 126)) {
          return new TextDecoder().decode(cmd)
        }
        return `[${Array.from(cmd).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}]`
      })
      .join('')
  }
}

// ============================================================
// PRINTER QUEUE
// ============================================================

export class PrinterQueue {
  constructor() {
    this.queue = []
    this.isConnected = false
    this.isPrinting = false
    this.device = null // Bluetooth or Serial device
    this.maxRetries = 3
  }

  // Add to queue
  enqueue(receipt) {
    this.queue.push({
      receipt,
      status: 'pending',
      retries: 0,
      createdAt: new Date(),
    })
    return this
  }

  // Connect to printer (Bluetooth)
  async connectBluetooth() {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'XP-58' }], // Filter for Xprinter
        optionalServices: ['serial'],
      })

      this.device = device
      this.isConnected = true
      console.log('Bluetooth printer connected:', device.name)
      return true
    } catch (error) {
      console.error('Bluetooth connection failed:', error)
      return false
    }
  }

  // Connect to printer (USB Serial)
  async connectUSB() {
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: 9600 })
      this.device = port
      this.isConnected = true
      console.log('USB printer connected')
      return true
    } catch (error) {
      console.error('USB connection failed:', error)
      return false
    }
  }

  // Print from queue
  async printQueue() {
    if (this.isPrinting) return
    this.isPrinting = true

    for (const job of this.queue) {
      if (job.status === 'printed') continue

      try {
        await this.print(job.receipt)
        job.status = 'printed'
      } catch (error) {
        job.retries++
        if (job.retries < this.maxRetries) {
          job.status = 'pending'
          console.warn(`Print failed, retrying (${job.retries}/${this.maxRetries}):`, error)
          await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1s before retry
        } else {
          job.status = 'failed'
          console.error('Print failed after retries:', error)
        }
      }
    }

    this.isPrinting = false
  }

  // Print single receipt
  async print(receipt) {
    if (!this.isConnected || !this.device) {
      throw new Error('Printer not connected')
    }

    const buffer = receipt.toArrayBuffer()

    try {
      if (this.device.port) {
        // Serial API (USB)
        const writer = this.device.writable.getWriter()
        await writer.write(new Uint8Array(buffer))
        writer.releaseLock()
      } else {
        // Bluetooth API
        const characteristic = await this.device.gatt.getPrimaryService('serial').then(
          s => s.getCharacteristic('serial_tx')
        )
        await characteristic.writeValue(new Uint8Array(buffer))
      }

      console.log('Print successful')
    } catch (error) {
      console.error('Print error:', error)
      throw error
    }
  }

  // Clear queue
  clear() {
    this.queue = []
  }

  // Get queue status
  getStatus() {
    return {
      total: this.queue.length,
      pending: this.queue.filter(j => j.status === 'pending').length,
      printed: this.queue.filter(j => j.status === 'printed').length,
      failed: this.queue.filter(j => j.status === 'failed').length,
      isConnected: this.isConnected,
      isPrinting: this.isPrinting,
    }
  }
}

// ============================================================
// SAMPLE RECEIPT (for testing)
// ============================================================

export function createSampleReceipt() {
  const receipt = new Receipt()

  receipt
    .reset()
    .spacing(1)
    .text('NOCHI COFFEE', { align: 'center', size: 'large', bold: true })
    .text('Downtown Branch', { align: 'center' })
    .spacing(1)
    .line('─')
    .spacing(1)
    .row(['Item', 'Price'], 'left')
    .row(['Espresso', '3.00 LYD'], 'left')
    .row(['Cappuccino', '4.50 LYD'], 'left')
    .row(['Croissant', '2.50 LYD'], 'left')
    .spacing(1)
    .line('─')
    .row(['Total:', '10.00 LYD'], 'left')
    .line('─')
    .spacing(2)
    .text('Thank you!', { align: 'center' })
    .text('2026-05-11 14:30', { align: 'center' })
    .spacing(3)
    .cut()

  return receipt
}
