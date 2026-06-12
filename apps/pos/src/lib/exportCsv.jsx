// exportCsv.js — tiny CSV builder + download helper.
// UTF-8 BOM is required so Excel renders Arabic text correctly.

export function rowsToCsv(headers, rows) {
  const esc = (v) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(esc).join(',')]
  for (const row of rows) lines.push(row.map(esc).join(','))
  return lines.join('\r\n')
}

export function downloadCsv(filename, headers, rows) {
  const csv = rowsToCsv(headers, rows)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Shared "Export CSV + Print" button pair. Render inside a filter bar.
// Both buttons carry .no-print so they vanish from the printed page.
import { Download, Printer } from 'lucide-react'

export function ExportButtons({ onCsv, label = 'Export CSV' }) {
  return (
    <span className="no-print inline-flex items-center gap-2">
      <button
        onClick={onCsv}
        className="btn-secondary text-xs px-3 py-1 flex items-center gap-1.5"
        title="Download as CSV (Excel-compatible)"
      >
        <Download size={12} /> {label}
      </button>
      <button
        onClick={() => window.print()}
        className="btn-secondary text-xs px-3 py-1 flex items-center gap-1.5"
        title="Print this view"
      >
        <Printer size={12} /> Print
      </button>
    </span>
  )
}
