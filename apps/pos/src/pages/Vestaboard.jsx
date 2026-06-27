import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Clock,
  Megaphone,
  Monitor,
  Play,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Layout from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import {
  getVestaboardMessages,
  getVestaboardAutomationSettings,
  markVestaboardSent,
  rejectVestaboardMessage,
  submitVestaboardMessage,
  updateVestaboardAutomationSetting,
} from '../lib/supabase'
import {
  VB_COLS,
  VB_MAX_CHARS,
  VB_MIN_SEND_INTERVAL_SECONDS,
  VB_ROWS,
  VESTABOARD_AUTOMATIONS,
  VESTABOARD_JOKE_LIBRARY,
  VESTABOARD_QUOTE_LIBRARY,
  buildVestaboardAutomationGrid,
  getVestaboardConfigStatus,
  getVestaboardOperatingStatus,
  getRandomVestaboardJoke,
  getRandomVestaboardQuote,
  previewVestaboardAutomationText,
  sendCustomerGreeting,
  sendVestaboard,
  sendVestaboardAutomation,
} from '../lib/vestaboard'

const COLOR_BLOCKS = {
  63: { name: 'Red', bg: '#EF4444' },
  64: { name: 'Orange', bg: '#F97316' },
  65: { name: 'Yellow', bg: '#EAB308' },
  66: { name: 'Green', bg: '#22C55E' },
  67: { name: 'Blue', bg: '#3B82F6' },
  68: { name: 'Violet', bg: '#8B5CF6' },
  69: { name: 'White', bg: '#F9FAFB', text: '#111827' },
  70: { name: 'Black', bg: '#111827' },
}

const TEMPLATE_OPTIONS = [
  { id: 'campaign_drop', label: 'Campaign drop', helper: 'Limited item, timed offer, launch, or event.' },
  { id: 'pickup_ready', label: 'Pickup ready', helper: 'Call a guest or order number to the counter.' },
  { id: 'loyalty_milestone', label: 'Loyalty moment', helper: 'Reward, stamp, birthday, or regular recognition.' },
  { id: 'social_proof', label: 'Social proof', helper: 'Best seller, review quote, fan post, or trend.' },
  { id: 'ops_signal', label: 'Ops signal', helper: 'Low stock, shift note, rush mode, or staff alert.' },
  { id: 'world_cup_score', label: 'World Cup', helper: 'Latest match score. Connect a sports feed later; staff can send now.' },
  { id: 'news_flash', label: 'News', helper: 'Short curated headline. Keep it useful and low frequency.' },
  { id: 'joke_break', label: 'Joke', helper: 'A quick personality moment for slow periods.' },
  { id: 'quote_break', label: 'Quote', helper: 'Short profound quotes for quiet, reflective moments.' },
]

const DEFAULT_CONTEXT = {
  campaign_drop: { headline: 'TODAY ONLY', detail: 'PISTACHIO COLD BREW', cta: 'LIMITED BATCH' },
  pickup_ready: { name: 'SARA', order: 'A17' },
  loyalty_milestone: { name: 'OMAR', detail: 'UNLOCKED A REWARD' },
  social_proof: { headline: 'FAN FAVORITE', detail: 'MATCHA SOLD OUT TWICE', cta: 'TRY IT EARLY' },
  ops_signal: { headline: 'STAFF NOTE', detail: 'LOW MILK CHECK', cta: 'TELL SHIFT LEAD' },
  world_cup_score: { match: 'ARG 2 - 1 FRA', score: '82 MIN LIVE', status: 'ONE MORE COFFEE?' },
  news_flash: { headline: 'NEWS FLASH', detail: 'WORLD CUP NIGHT', source: 'NOCH SCREEN' },
  joke_break: VESTABOARD_JOKE_LIBRARY[0],
  quote_break: VESTABOARD_QUOTE_LIBRARY[0],
}

const STATUS_META = {
  pending: { label: 'Pending', cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  approved: { label: 'Approved', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  sent: { label: 'Sent', cls: 'bg-green-500/15 text-noch-green border-green-500/30' },
  rejected: { label: 'Rejected', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
}

function codeToChar(code) {
  if (code === 0 || code >= 63) return ''
  if (code >= 1 && code <= 26) return String.fromCharCode(64 + code)
  if (code >= 27 && code <= 35) return String(code - 26)
  if (code === 36) return '0'
  return {
    37: '!', 38: '@', 39: '#', 40: '$', 41: '(', 42: ')', 43: '-',
    44: '+', 45: '&', 46: '=', 47: ';', 48: ':', 49: "'", 50: '"',
    51: '%', 52: ',', 53: '.', 54: '/', 55: '?',
  }[code] || ''
}

function textToGrid(text) {
  const rows = Array.from({ length: VB_ROWS }, () => Array(VB_COLS).fill(0))
  String(text || '').split('\n').slice(0, VB_ROWS).forEach((line, r) => {
    ;[...line.toUpperCase()].slice(0, VB_COLS).forEach((ch, c) => {
      const code = ch === ' ' ? 0 : ch.charCodeAt(0)
      if (code >= 65 && code <= 90) rows[r][c] = code - 64
      else if (ch >= '1' && ch <= '9') rows[r][c] = 27 + Number(ch) - 1
      else if (ch === '0') rows[r][c] = 36
      else if (ch === '!') rows[r][c] = 37
      else if (ch === '?') rows[r][c] = 55
    })
  })
  return rows
}

function sanitizeBoardText(value) {
  const rows = []
  const sourceLines = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 !@#$()+\-&=;:'"%.,/?\n]/g, ' ')
    .replace(/\r/g, '')
    .toUpperCase()
    .split('\n')

  for (const sourceLine of sourceLines) {
    let line = sourceLine.replace(/\s+/g, ' ').trimStart()
    if (!line) {
      rows.push('')
    } else {
      while (line.length > 0) {
        rows.push(line.slice(0, VB_COLS).trimEnd())
        line = line.slice(VB_COLS)
      }
    }
    if (rows.length >= VB_ROWS) break
  }

  return rows.slice(0, VB_ROWS).join('\n')
}

function BoardPreview({ grid, compact = false }) {
  const cellW = compact ? 10 : 18
  const cellH = compact ? 13 : 23
  const fontSize = compact ? 7 : 10
  return (
    <div className="inline-flex flex-col gap-[2px] bg-black border border-zinc-800 rounded-lg p-2 shadow-inner max-w-full overflow-hidden">
      {grid.map((row, r) => (
        <div key={r} className="flex gap-[2px]">
          {row.map((code, c) => {
            const color = COLOR_BLOCKS[code]
            return (
              <div
                key={`${r}-${c}`}
                title={color?.name || codeToChar(code)}
                style={{
                  width: cellW,
                  height: cellH,
                  background: color?.bg || '#111',
                  color: color?.text || '#FFC107',
                  fontSize,
                }}
                className="flex shrink-0 items-center justify-center rounded-[2px] font-mono font-bold"
              >
                {!color && codeToChar(code)}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-noch-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input w-full text-sm"
        maxLength={22}
      />
    </label>
  )
}

function AutomationSwitch({ item, setting, disabled, onToggle, onNumberChange }) {
  const enabled = !!setting?.enabled
  return (
    <div className="rounded-lg border border-noch-border bg-noch-dark p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">{item.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              enabled ? 'bg-green-500/15 text-noch-green' : 'bg-zinc-700 text-zinc-300'
            }`}>
              {enabled ? 'On' : 'Off'}
            </span>
          </div>
          <p className="mt-1 text-xs text-noch-muted">{item.trigger}</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggle(item.id, !enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? 'bg-noch-green' : 'bg-zinc-700'
          } disabled:opacity-50`}
          aria-label={`Toggle ${item.title}`}
        >
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
            enabled ? 'left-6' : 'left-1'
          }`} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-noch-muted">Every min</span>
          <input
            type="number"
            min="5"
            value={setting?.cadence_minutes ?? 60}
            disabled={disabled}
            onChange={(event) => onNumberChange(item.id, 'cadence_minutes', event.target.value)}
            className="input w-full text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-noch-muted">Max / day</span>
          <input
            type="number"
            min="1"
            value={setting?.max_per_day ?? 12}
            disabled={disabled}
            onChange={(event) => onNumberChange(item.id, 'max_per_day', event.target.value)}
            className="input w-full text-sm"
          />
        </label>
      </div>
      <div className="mt-2 flex justify-between gap-2 text-[11px] text-noch-muted">
        <span>Provider: {setting?.provider || 'default'}</span>
        <span>{setting?.last_sent_at ? `Last: ${new Date(setting.last_sent_at).toLocaleTimeString()}` : 'Not sent yet'}</span>
      </div>
    </div>
  )
}

export default function Vestaboard() {
  const { isOwner } = useAuth()
  const [messages, setMessages] = useState([])
  const [automationSettings, setAutomationSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [savingSetting, setSavingSetting] = useState(null)
  const [sending, setSending] = useState(false)
  const [manualMessage, setManualMessage] = useState('WELCOME TO NOCH\nORDER SOMETHING GOOD')
  const [selectedTemplate, setSelectedTemplate] = useState('campaign_drop')
  const [templateContext, setTemplateContext] = useState(DEFAULT_CONTEXT.campaign_drop)
  const [testName, setTestName] = useState('AHMED')

  const config = useMemo(() => getVestaboardConfigStatus(), [])
  const operatingStatus = useMemo(() => getVestaboardOperatingStatus(), [])
  const selectedMeta = TEMPLATE_OPTIONS.find(t => t.id === selectedTemplate) || TEMPLATE_OPTIONS[0]
  const automationGrid = useMemo(
    () => buildVestaboardAutomationGrid(selectedTemplate, templateContext),
    [selectedTemplate, templateContext],
  )
  const automationText = useMemo(
    () => previewVestaboardAutomationText(selectedTemplate, templateContext),
    [selectedTemplate, templateContext],
  )
  const manualGrid = useMemo(() => textToGrid(manualMessage), [manualMessage])
  const settingsById = useMemo(
    () => Object.fromEntries(automationSettings.map(setting => [setting.automation_id, setting])),
    [automationSettings],
  )

  const load = async () => {
    setLoading(true)
    try {
      const [messageRows, settingRows] = await Promise.all([
        getVestaboardMessages(),
        getVestaboardAutomationSettings(),
      ])
      setMessages(messageRows)
      setAutomationSettings(settingRows)
    } catch (err) {
      toast.error(err.message || 'Failed to load Vestaboard queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const updateTemplate = (id) => {
    setSelectedTemplate(id)
    setTemplateContext(DEFAULT_CONTEXT[id] || {})
  }

  const updateContext = (key, value) => {
    setTemplateContext(prev => ({ ...prev, [key]: value }))
  }

  const saveAutomationSetting = async (automationId, updates) => {
    if (!isOwner) {
      toast.error('Owner only')
      return
    }
    setSavingSetting(automationId)
    try {
      const saved = await updateVestaboardAutomationSetting(automationId, updates)
      setAutomationSettings(prev => {
        const exists = prev.some(item => item.automation_id === automationId)
        if (!exists) return [...prev, saved]
        return prev.map(item => item.automation_id === automationId ? { ...item, ...saved } : item)
      })
      toast.success('Automation setting saved')
    } catch (err) {
      toast.error(err.message || 'Could not save setting')
    } finally {
      setSavingSetting(null)
    }
  }

  const toggleAutomation = (automationId, enabled) => {
    const current = settingsById[automationId] || {}
    saveAutomationSetting(automationId, { ...current, enabled })
  }

  const updateAutomationNumber = (automationId, key, value) => {
    const current = settingsById[automationId] || {}
    const numeric = Math.max(key === 'cadence_minutes' ? 5 : 1, Number(value) || 0)
    saveAutomationSetting(automationId, { ...current, [key]: numeric })
  }

  const loadRandomJoke = () => {
    setSelectedTemplate('joke_break')
    setTemplateContext(getRandomVestaboardJoke())
  }

  const loadRandomQuote = () => {
    setSelectedTemplate('quote_break')
    setTemplateContext(getRandomVestaboardQuote())
  }

  const handleSubmitManual = async () => {
    if (!manualMessage.trim()) return
    setSubmitting(true)
    try {
      const message = sanitizeBoardText(manualMessage)
      const result = await sendVestaboard(message)
      await submitVestaboardMessage(message, { status: 'sent', sent_at: new Date().toISOString() })
      toast.success(result?.simulated ? 'Manual message simulated' : 'Sent to Vestaboard')
      await load()
    } catch (err) {
      toast.error(err.message || 'Send failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleQueueTemplate = async () => {
    setSubmitting(true)
    try {
      const result = await sendVestaboardAutomation(selectedTemplate, templateContext)
      if (result?.skipped) {
        toast(`Automation skipped: cafe is closed (${result.status?.summary || 'outside operating hours'})`)
        return
      }
      await submitVestaboardMessage(automationText, { status: 'sent', sent_at: new Date().toISOString() })
      toast.success(result?.simulated ? 'Template simulated' : 'Sent to Vestaboard')
      await load()
    } catch (err) {
      toast.error(err.message || 'Send failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGreetingTest = async () => {
    setSending(true)
    try {
      const result = await sendCustomerGreeting(testName, { seed: `test-${testName}` })
      if (result?.skipped) {
        toast(`Greeting skipped: ${result.reason === 'outside_operating_hours' ? 'cafe is closed' : result.reason}`)
        return
      }
      toast.success(result?.simulated ? 'Greeting simulated' : `Greeting sent for ${testName}`)
    } catch (err) {
      toast.error(err.message || 'Greeting failed')
    } finally {
      setSending(false)
    }
  }

  const handleReject = async (id) => {
    const note = prompt('Rejection reason (optional)') || ''
    try {
      await rejectVestaboardMessage(id, note)
      toast.success('Rejected')
      load()
    } catch (err) {
      toast.error(err.message || 'Reject failed')
    }
  }

  const handleSendQueued = async (msg) => {
    try {
      await sendVestaboard(msg.message)
      await markVestaboardSent(msg.id)
      toast.success('Sent to Vestaboard')
      load()
    } catch (err) {
      toast.error(err.message || 'Send failed')
    }
  }

  const sentCount = messages.filter(msg => msg.status === 'sent').length

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Monitor className="text-noch-green" size={26} />
            <div>
              <h1 className="text-2xl font-bold text-white">Vestaboard Control Room</h1>
              <p className="text-sm text-noch-muted">Automated in-store messages for guest delight, marketing, and staff signals.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-noch-border bg-noch-card px-3 py-1 text-noch-muted">{config.modeLabel}</span>
            <span className={`rounded-full border px-3 py-1 ${
              operatingStatus.isOpen
                ? 'border-green-500/30 bg-green-500/10 text-noch-green'
                : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
            }`}>
              {operatingStatus.label}
            </span>
            <span className="rounded-full border border-noch-border bg-noch-card px-3 py-1 text-noch-muted">{sentCount} sent</span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <Activity size={16} className="text-noch-green" />
              <h2 className="font-semibold text-white">Connection</h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-noch-muted">Mode</span>
                <span className="text-white">{config.modeLabel}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-noch-muted">Host</span>
                <span className="max-w-[180px] truncate text-right text-white">{config.host || 'Not set'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-noch-muted">Cloud key</span>
                <span className={config.hasKey ? 'text-noch-green' : 'text-yellow-300'}>{config.hasKey ? 'Configured' : 'Missing'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-noch-muted">Hours</span>
                <span className="text-right text-white">{operatingStatus.todayLabel}</span>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-100">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <Clock size={13} /> Send pacing
              </div>
              Keep automated sends at least {VB_MIN_SEND_INTERVAL_SECONDS}s apart so messages are not dropped during rush periods.
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <Users size={16} className="text-noch-green" />
              <h2 className="font-semibold text-white">Live trigger</h2>
            </div>
            <p className="text-sm text-noch-muted">POS already fires a colorful greeting after every named order.</p>
            <div className="mt-3 flex gap-2">
              <input
                value={testName}
                onChange={(event) => setTestName(event.target.value)}
                className="input min-w-0 flex-1 text-sm"
                maxLength={16}
              />
              <button onClick={handleGreetingTest} disabled={sending} className="btn-secondary flex items-center gap-2 text-sm">
                <Play size={14} /> Test
              </button>
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-yellow-300" />
              <h2 className="font-semibold text-white">Next wiring targets</h2>
            </div>
            <div className="space-y-2 text-sm text-noch-muted">
              <p>Connect ready-order events for pickup calls.</p>
              <p>Connect loyalty stamps, reviews, UGC, and campaigns to live business data.</p>
              <p>Owner approval is removed; staff and POS can post automatically.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity size={17} className="text-noch-green" />
                <h2 className="font-semibold text-white">Automation switches</h2>
              </div>
              <span className="text-xs text-noch-muted">{isOwner ? 'Owner controls' : 'Owner only'}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {VESTABOARD_AUTOMATIONS.map(item => (
                <AutomationSwitch
                  key={item.id}
                  item={item}
                  setting={settingsById[item.id]}
                  disabled={!isOwner || savingSetting === item.id}
                  onToggle={toggleAutomation}
                  onNumberChange={updateAutomationNumber}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <Megaphone size={17} className="text-noch-green" />
              <h2 className="font-semibold text-white">Marketing template</h2>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {TEMPLATE_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => updateTemplate(option.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selectedTemplate === option.id
                      ? 'border-noch-green bg-noch-green/10 text-noch-green'
                      : 'border-noch-border bg-noch-dark text-noch-muted hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mb-4 text-xs text-noch-muted">{selectedMeta.helper}</p>

            <div className="grid gap-3">
              {selectedTemplate === 'pickup_ready' ? (
                <>
                  <Field label="Name" value={templateContext.name || ''} onChange={v => updateContext('name', v)} />
                  <Field label="Order" value={templateContext.order || ''} onChange={v => updateContext('order', v)} />
                </>
              ) : selectedTemplate === 'loyalty_milestone' ? (
                <>
                  <Field label="Name" value={templateContext.name || ''} onChange={v => updateContext('name', v)} />
                  <Field label="Moment" value={templateContext.detail || ''} onChange={v => updateContext('detail', v)} />
                </>
              ) : selectedTemplate === 'world_cup_score' ? (
                <>
                  <Field label="Match" value={templateContext.match || ''} onChange={v => updateContext('match', v)} />
                  <Field label="Score / time" value={templateContext.score || ''} onChange={v => updateContext('score', v)} />
                  <Field label="CTA" value={templateContext.status || ''} onChange={v => updateContext('status', v)} />
                </>
              ) : selectedTemplate === 'news_flash' ? (
                <>
                  <Field label="Headline" value={templateContext.headline || ''} onChange={v => updateContext('headline', v)} />
                  <Field label="Detail" value={templateContext.detail || ''} onChange={v => updateContext('detail', v)} />
                  <Field label="Source / CTA" value={templateContext.source || ''} onChange={v => updateContext('source', v)} />
                </>
              ) : selectedTemplate === 'joke_break' ? (
                <>
                  <Field label="Line 1" value={templateContext.setup || ''} onChange={v => updateContext('setup', v)} />
                  <Field label="Line 2" value={templateContext.punchline || ''} onChange={v => updateContext('punchline', v)} />
                  <Field label="Line 3" value={templateContext.cta || ''} onChange={v => updateContext('cta', v)} />
                  <button type="button" onClick={loadRandomJoke} className="btn-secondary text-sm">
                    Load another joke
                  </button>
                </>
              ) : selectedTemplate === 'quote_break' ? (
                <>
                  <Field label="Person" value={templateContext.author || ''} onChange={v => updateContext('author', v)} />
                  <Field label="Line 1" value={templateContext.quote || ''} onChange={v => updateContext('quote', v)} />
                  <Field label="Line 2" value={templateContext.cta || ''} onChange={v => updateContext('cta', v)} />
                  <button type="button" onClick={loadRandomQuote} className="btn-secondary text-sm">
                    Load another quote
                  </button>
                </>
              ) : (
                <>
                  <Field label="Line 1" value={templateContext.headline || ''} onChange={v => updateContext('headline', v)} />
                  <Field label="Line 2" value={templateContext.detail || ''} onChange={v => updateContext('detail', v)} />
                  <Field label="Line 3" value={templateContext.cta || ''} onChange={v => updateContext('cta', v)} />
                </>
              )}
            </div>

            <div className="my-4 overflow-x-auto text-center">
              <BoardPreview grid={automationGrid} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={handleQueueTemplate} disabled={submitting} className="btn-primary flex items-center gap-2 text-sm">
                <Send size={14} /> Send now
              </button>
            </div>
          </div>
        </div>

        <div className="card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={17} className="text-noch-green" />
                <h2 className="font-semibold text-white">Automation playbook</h2>
              </div>
              <span className="text-xs text-noch-muted">Current + ready-to-wire use cases</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {VESTABOARD_AUTOMATIONS.map(item => (
                <button
                  key={item.id}
                  onClick={() => item.id in DEFAULT_CONTEXT && updateTemplate(item.id)}
                  className="rounded-lg border border-noch-border bg-noch-dark p-3 text-left transition-colors hover:border-noch-green/50"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{item.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      item.status === 'live' ? 'bg-green-500/15 text-noch-green' : 'bg-zinc-700 text-zinc-300'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-noch-muted">{item.goal}</p>
                  <div className="space-y-1 text-[11px] text-zinc-400">
                    <p>Trigger: {item.trigger}</p>
                    <p>Cadence: {item.cadence}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-white">Manual board message</h2>
              <span className="font-mono text-xs text-noch-muted">
                {manualMessage.split('\n').length}/{VB_ROWS} rows · {VB_COLS} cols
              </span>
            </div>
            <textarea
              value={manualMessage}
              onChange={(event) => setManualMessage(sanitizeBoardText(event.target.value))}
              rows={6}
              className="input min-h-[150px] w-full resize-y font-mono text-sm"
              placeholder="6 rows max, 22 characters per row"
            />
            <div className="my-4 overflow-x-auto text-center">
              <BoardPreview grid={manualGrid} />
            </div>
            <button onClick={handleSubmitManual} disabled={submitting || !manualMessage.trim()} className="btn-primary flex items-center gap-2 text-sm">
              <Send size={14} /> Send now
            </button>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">Message history</h2>
              <button onClick={load} className="btn-secondary text-xs">Refresh</button>
            </div>

            {loading ? (
              <p className="py-8 text-center text-sm text-noch-muted">Loading...</p>
            ) : messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-noch-muted">No Vestaboard messages yet.</p>
            ) : (
              <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
                {messages.map(msg => (
                  <div key={msg.id} className="rounded-lg border border-noch-border bg-noch-dark p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={msg.status} />
                        <span className="text-xs text-noch-muted">{msg.submitted_by_profile?.full_name || 'Team'}</span>
                      </div>
                      <span className="text-xs text-noch-muted">{new Date(msg.created_at).toLocaleString()}</span>
                    </div>
                    <div className="mb-3 overflow-x-auto text-center">
                      <BoardPreview grid={textToGrid(msg.message)} compact />
                    </div>
                    {msg.rejection_note && <p className="mb-3 text-xs text-red-300">Rejected: {msg.rejection_note}</p>}
                    {isOwner && msg.status === 'pending' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleSendQueued(msg)} className="btn-primary flex items-center gap-1 px-3 py-1 text-xs">
                          <Send size={12} /> Send
                        </button>
                        <button onClick={() => handleReject(msg.id)} className="btn-danger flex items-center gap-1 px-3 py-1 text-xs">
                          <X size={12} /> Reject
                        </button>
                      </div>
                    )}
                    {isOwner && msg.status === 'approved' && (
                      <button onClick={() => handleSendQueued(msg)} className="btn-primary flex items-center gap-1 px-3 py-1 text-xs">
                        <Send size={12} /> Send to board
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
