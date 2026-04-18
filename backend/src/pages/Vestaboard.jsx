import { useState, useEffect, useRef, useCallback } from 'react'
import { Monitor, Send, Check, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import Layout from '../components/Layout'
import {
  getVestaboardMessages,
  submitVestaboardMessage,
  approveVestaboardMessage,
  rejectVestaboardMessage,
  markVestaboardSent,
} from '../lib/supabase'
import { sendVestaboard, VB_ROWS, VB_COLS, VB_MAX_CHARS } from '../lib/vestaboard'
import toast from 'react-hot-toast'

// ─── Character code helpers ───────────────────────────────────────────────────

// Map a character to its Vestaboard numeric code
function charToCode(ch) {
  const c = ch.toUpperCase()
  if (c === ' ') return 0
  const a = c.charCodeAt(0)
  if (a >= 65 && a <= 90) return a - 64        // A=1 … Z=26
  if (c >= '1' && c <= '9') return 27 + parseInt(c) - 1  // 1=27 … 9=35
  if (c === '0') return 36
  if (c === '!') return 37
  if (c === '@') return 38
  if (c === '#') return 39
  return 0 // unknown → blank
}

// Map a code back to display character
function codeToChar(code) {
  if (code === 0) return ' '
  if (code >= 1 && code <= 26) return String.fromCharCode(64 + code)
  if (code >= 27 && code <= 35) return String(code - 26)
  if (code === 36) return '0'
  if (code === 37) return '!'
  if (code === 38) return '@'
  if (code === 39) return '#'
  return ' ' // color blocks rendered separately
}

const COLOR_BLOCKS = {
  63: { name: 'Red',    bg: '#EF4444' },
  64: { name: 'Orange', bg: '#F97316' },
  65: { name: 'Yellow', bg: '#EAB308' },
  66: { name: 'Green',  bg: '#22C55E' },
  67: { name: 'Blue',   bg: '#3B82F6' },
  68: { name: 'Violet', bg: '#8B5CF6' },
  69: { name: 'White',  bg: '#F9FAFB' },
  70: { name: 'Black',  bg: '#1C1C1C', border: '#444' },
}

const isColorCode = (code) => code >= 63 && code <= 70

// Build empty 6×22 board
const emptyBoard = () => Array.from({ length: VB_ROWS }, () => Array(VB_COLS).fill(0))

// Convert board to plain text string (for DB storage)
function boardToText(board) {
  return board.map(row => row.map(codeToChar).join('')).join('\n').trimEnd()
}

// Convert plain text to board codes
function textToBoard(text) {
  const b = emptyBoard()
  const lines = text.split('\n')
  for (let r = 0; r < VB_ROWS && r < lines.length; r++) {
    for (let c = 0; c < VB_COLS && c < lines[r].length; c++) {
      b[r][c] = charToCode(lines[r][c])
    }
  }
  return b
}

// Count non-blank cells
function charCount(board) {
  return board.flat().filter(c => c !== 0).length
}

// ─── Single cell renderer ─────────────────────────────────────────────────────
function VBCell({ code, active, onClick, small }) {
  const w = small ? 12 : 28
  const h = small ? 15 : 36
  const fontSize = small ? 8 : 13

  const colorInfo = isColorCode(code) ? COLOR_BLOCKS[code] : null

  const cellStyle = {
    width: w,
    height: h,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: small ? 1 : 3,
    fontSize,
    fontFamily: '"Courier New", Courier, monospace',
    fontWeight: 'bold',
    cursor: onClick ? 'pointer' : 'default',
    userSelect: 'none',
    backgroundColor: colorInfo ? colorInfo.bg : '#111',
    color: colorInfo ? 'transparent' : '#FFC107',
    boxShadow: active ? '0 0 0 2px #4ADE80' : colorInfo?.border ? `inset 0 0 0 1px ${colorInfo.border}` : 'none',
    outline: 'none',
    transition: 'box-shadow 0.1s',
  }

  return (
    <div style={cellStyle} onClick={onClick}>
      {!colorInfo && (code !== 0 ? codeToChar(code) : '')}
    </div>
  )
}

// ─── Board grid (interactive or read-only) ────────────────────────────────────
function VBBoard({ board, cursor, onCellClick, small, tabIndex, onKeyDown, boardRef }) {
  const gap = small ? 1 : 2

  const gridStyle = {
    display: 'inline-flex',
    flexDirection: 'column',
    gap,
    backgroundColor: '#0D0D0D',
    border: '3px solid #1a1a1a',
    borderRadius: small ? 4 : 8,
    padding: small ? 4 : 8,
    outline: 'none',
    boxShadow: '0 0 0 1px #222, inset 0 2px 8px rgba(0,0,0,0.8)',
  }

  return (
    <div
      ref={boardRef}
      style={gridStyle}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
    >
      {board.map((row, r) => (
        <div key={r} style={{ display: 'flex', gap }}>
          {row.map((code, c) => (
            <VBCell
              key={c}
              code={code}
              active={!small && cursor && cursor.row === r && cursor.col === c}
              onClick={onCellClick ? () => onCellClick(r, c) : undefined}
              small={small}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Color palette bar ────────────────────────────────────────────────────────
function ColorPalette({ onColor }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {Object.entries(COLOR_BLOCKS).map(([code, info]) => (
        <button
          key={code}
          title={info.name}
          onClick={() => onColor(parseInt(code))}
          style={{
            backgroundColor: info.bg,
            border: info.border ? `1px solid ${info.border}` : '1px solid transparent',
            borderRadius: 6,
            width: 36,
            height: 28,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 9, color: parseInt(code) >= 69 ? '#000' : '#fff', fontWeight: 700, opacity: 0.7 }}>
            {info.name.toUpperCase().slice(0, 3)}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_META = {
  pending:  { label: 'PENDING',  cls: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' },
  approved: { label: 'APPROVED', cls: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' },
  sent:     { label: 'SENT',     cls: 'bg-green-500/15 text-noch-green border border-green-500/30' },
  rejected: { label: 'REJECTED', cls: 'bg-red-500/15 text-red-400 border border-red-500/30' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.cls}`}>
      {m.label}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Vestaboard() {
  const { isOwner } = useAuth()
  const { lang } = useLanguage()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Board state
  const [board, setBoard] = useState(emptyBoard)
  const [cursor, setCursor] = useState({ row: 0, col: 0 })
  const boardRef = useRef(null)

  const load = async () => {
    try { setMessages(await getVestaboardMessages()) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Advance cursor by one cell
  const advanceCursor = useCallback((r, c) => {
    let nc = c + 1, nr = r
    if (nc >= VB_COLS) { nc = 0; nr = Math.min(r + 1, VB_ROWS - 1) }
    setCursor({ row: nr, col: nc })
  }, [])

  // Handle keyboard input on the board
  const handleKeyDown = useCallback((e) => {
    const { row, col } = cursor

    // Printable character
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      const code = charToCode(e.key)
      setBoard(prev => {
        const next = prev.map(r => [...r])
        next[row][col] = code
        return next
      })
      advanceCursor(row, col)
      return
    }

    if (e.key === 'Backspace') {
      e.preventDefault()
      // Move back one cell and clear it
      let pr = row, pc = col - 1
      if (pc < 0) { pc = VB_COLS - 1; pr = Math.max(row - 1, 0) }
      setBoard(prev => {
        const next = prev.map(r => [...r])
        next[pr][pc] = 0
        return next
      })
      setCursor({ row: pr, col: pc })
      return
    }

    if (e.key === 'Delete') {
      e.preventDefault()
      setBoard(prev => {
        const next = prev.map(r => [...r])
        next[row][col] = 0
        return next
      })
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const nextRow = Math.min(row + 1, VB_ROWS - 1)
      setCursor({ row: nextRow, col: 0 })
      return
    }

    // Arrow keys
    if (e.key === 'ArrowRight') { e.preventDefault(); advanceCursor(row, col); return }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      let pr = row, pc = col - 1
      if (pc < 0) { pc = VB_COLS - 1; pr = Math.max(row - 1, 0) }
      setCursor({ row: pr, col: pc })
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor({ row: Math.min(row + 1, VB_ROWS - 1), col }); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor({ row: Math.max(row - 1, 0), col }); return }
  }, [cursor, advanceCursor])

  // Insert a color block at cursor
  const insertColor = useCallback((code) => {
    const { row, col } = cursor
    setBoard(prev => {
      const next = prev.map(r => [...r])
      next[row][col] = code
      return next
    })
    advanceCursor(row, col)
    boardRef.current?.focus()
  }, [cursor, advanceCursor])

  const handleCellClick = useCallback((r, c) => {
    setCursor({ row: r, col: c })
    boardRef.current?.focus()
  }, [])

  const handleClear = () => {
    setBoard(emptyBoard())
    setCursor({ row: 0, col: 0 })
    boardRef.current?.focus()
  }

  const handleSubmit = async () => {
    const text = boardToText(board)
    if (!text.trim()) return
    setSubmitting(true)
    try {
      await submitVestaboardMessage(text)
      setBoard(emptyBoard())
      setCursor({ row: 0, col: 0 })
      toast.success(lang === 'ar' ? 'تم إرسال الرسالة للمراجعة' : 'Message submitted for review')
      load()
    } catch (err) { toast.error(err.message) }
    finally { setSubmitting(false) }
  }

  const handleApprove = async (id) => {
    try { await approveVestaboardMessage(id); load(); toast.success('Approved') }
    catch (err) { toast.error(err.message) }
  }

  const handleReject = async (id) => {
    const note = prompt(lang === 'ar' ? 'سبب الرفض (اختياري)' : 'Rejection reason (optional)') ?? ''
    try { await rejectVestaboardMessage(id, note); load(); toast.success('Rejected') }
    catch (err) { toast.error(err.message) }
  }

  const handleSend = async (msg) => {
    try {
      await sendVestaboard(msg.message)
      await markVestaboardSent(msg.id)
      toast.success(lang === 'ar' ? 'تم الإرسال إلى Vestaboard' : 'Sent to Vestaboard')
      load()
    } catch (err) { toast.error(err.message) }
  }

  const totalChars = charCount(board)
  const hasContent = totalChars > 0

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Monitor className="text-noch-green" size={24} />
          <div>
            <h1 className="text-white font-bold text-xl">Vestaboard</h1>
            <p className="text-noch-muted text-sm">
              {lang === 'ar' ? 'أرسل رسالة للشاشة في المقهى' : 'Send a message to the café board'}
            </p>
          </div>
        </div>

        {/* ── Composer ── */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">
              {lang === 'ar' ? 'رسالة جديدة' : 'New Message'}
            </h2>
            <span className="text-noch-muted text-xs font-mono">{totalChars}/{VB_MAX_CHARS} chars</span>
          </div>

          {/* Board — click to focus, then type */}
          <div className="flex justify-center mb-1">
            <VBBoard
              board={board}
              cursor={cursor}
              onCellClick={handleCellClick}
              onKeyDown={handleKeyDown}
              boardRef={boardRef}
              tabIndex={0}
            />
          </div>

          <p className="text-noch-muted text-xs text-center mb-3 mt-2">
            Click any cell then type — Enter moves to next row — arrow keys navigate
          </p>

          {/* Color palette */}
          <div className="border-t border-noch-border pt-3">
            <p className="text-noch-muted text-xs mb-2">Color blocks:</p>
            <ColorPalette onColor={insertColor} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSubmit}
              disabled={submitting || !hasContent}
              className="btn-primary flex items-center gap-2"
            >
              <Send size={14} />
              {lang === 'ar' ? 'إرسال للمراجعة' : 'Submit for Review'}
            </button>
            {hasContent && (
              <button onClick={handleClear} className="btn-secondary text-sm">
                {lang === 'ar' ? 'مسح' : 'Clear'}
              </button>
            )}
          </div>
        </div>

        {/* ── Message Queue (owner only) ── */}
        {isOwner && (
          <div className="card">
            <h2 className="text-white font-semibold mb-4">
              {lang === 'ar' ? 'قائمة الرسائل' : 'Message Queue'}
            </h2>

            {loading ? (
              <p className="text-noch-muted text-sm">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-noch-muted text-sm text-center py-8">
                {lang === 'ar' ? 'لا توجد رسائل بعد' : 'No messages yet'}
              </p>
            ) : (
              <div className="space-y-4">
                {messages.map(msg => {
                  const msgBoard = textToBoard(msg.message || '')
                  return (
                    <div key={msg.id} className="bg-noch-dark border border-noch-border rounded-xl p-3">
                      {/* Meta row */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={msg.status} />
                          <span className="text-noch-muted text-xs">
                            {msg.submitted_by_profile?.full_name}
                          </span>
                        </div>
                        <span className="text-noch-muted text-xs">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>

                      {/* Mini board preview */}
                      <div className="flex justify-center mb-3">
                        <VBBoard
                          board={msgBoard}
                          small
                        />
                      </div>

                      {/* Rejection note */}
                      {msg.rejection_note && (
                        <p className="text-red-400 text-xs mb-3">
                          Rejection note: {msg.rejection_note}
                        </p>
                      )}

                      {/* Owner actions */}
                      {msg.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(msg.id)}
                            className="btn-secondary flex items-center gap-1 text-xs py-1 px-3"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            onClick={() => handleReject(msg.id)}
                            className="btn-danger flex items-center gap-1 text-xs py-1 px-3"
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                      {msg.status === 'approved' && (
                        <button
                          onClick={() => handleSend(msg)}
                          className="btn-primary flex items-center gap-1 text-xs py-1 px-3"
                        >
                          <Send size={12} /> Send to Board
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
