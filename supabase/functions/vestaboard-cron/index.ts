// vestaboard-cron — automatic board feed for scores, news, jokes, and quotes.
//
// Schedule it with pg_cron. The function itself enforces operating hours,
// pacing, and source priority, so cron can safely tick every few minutes.
//
// Optional env:
//   VESTABOARD_API_KEY       Cloud Read/Write key
//   VESTABOARD_HOST          Local board host, if using LAN API
//   SPORTS_FEED_PROVIDER     worldcup2026 | custom | off
//   SPORTS_FEED_URL          Override/custom live-score JSON endpoint
//   SPORTS_FEED_KEY          Optional bearer/API key for SPORTS_FEED_URL
//   NEWS_FEED_PROVIDER       newsdata | newsapi | custom | off
//   NEWS_FEED_URL            Override/custom curated news JSON endpoint
//   NEWS_FEED_KEY            Optional bearer/API key for news/custom endpoint
//   NEWS_FEED_QUERY          Optional news search term, defaults to cafe/football-safe headlines
//   JOKE_FEED_PROVIDER       jokeapi | local | off
//   JOKE_FEED_URL            Optional custom joke JSON endpoint
//   QUOTE_FEED_PROVIDER      zenquotes | local | off
//   QUOTE_FEED_URL           Optional custom quote JSON endpoint

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VB_ROWS = 6
const VB_COLS = 22
const MIN_SEND_INTERVAL_MINUTES = 15
const VESTABOARD_AUTOMATION_SETTINGS_KEY = 'vestaboard_automation_settings'

const COLOR = {
  RED: 63, ORANGE: 64, YELLOW: 65, GREEN: 66,
  BLUE: 67, VIOLET: 68, WHITE: 69, BLACK: 70,
}

const JOKES = [
  { setup: 'WHY DID COFFEE', punchline: 'FILE A REPORT?', cta: 'IT GOT MUGGED' },
  { setup: 'ESPRESSO YOURSELF', punchline: 'BUT PLEASE', cta: 'ORDER FIRST' },
  { setup: 'NOCHI SAYS', punchline: 'ONE MORE DRINK', cta: 'IS RESEARCH' },
  { setup: 'MATCHA LATTE', punchline: 'IS JUST GREEN', cta: 'CONFIDENCE' },
]

const QUOTES = [
  { author: 'SENECA', quote: 'LUCK FAVORS', cta: 'THE PREPARED MIND' },
  { author: 'MAYA ANGELOU', quote: 'COURAGE MAKES', cta: 'EVERYTHING POSSIBLE' },
  { author: 'RUMI', quote: 'WHAT YOU SEEK', cta: 'IS SEEKING YOU' },
  { author: 'SOCRATES', quote: 'KNOW THYSELF', cta: 'BEGIN THERE' },
  { author: 'JAMES BALDWIN', quote: 'NOT EVERYTHING FACED', cta: 'CAN BE CHANGED' },
  { author: 'MARY OLIVER', quote: 'PAY ATTENTION', cta: 'BE ASTONISHED' },
  { author: 'CONFUCIUS', quote: 'WHEREVER YOU GO', cta: 'GO WITH ALL HEART' },
  { author: 'MARCUS AURELIUS', quote: 'MEET THE MOMENT', cta: 'WITHOUT COMPLAINT' },
]

type FeedMessage = {
  type: 'world_cup_score' | 'news_flash' | 'joke_break' | 'quote_break'
  text: string
  characters: number[][]
}

type ProviderName = 'worldcup2026' | 'newsdata' | 'newsapi' | 'jokeapi' | 'zenquotes' | 'custom' | 'local' | 'off'

type AutomationSetting = {
  automation_id: string
  enabled: boolean
  cadence_minutes: number
  max_per_day: number
  priority: number
  provider?: string | null
}

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Tripoli',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  return {
    weekday: get('weekday'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  }
}

function isOperatingHours(now = new Date()) {
  const p = localParts(now)
  const minutes = (p.hour * 60) + p.minute
  const isFriday = p.weekday === 'Fri'
  const isSaturday = p.weekday === 'Sat'
  if (isFriday) return minutes >= (16 * 60)
  if (isSaturday && minutes < 30) return true
  return minutes >= (9 * 60)
}

function code(ch: string) {
  if (!ch || ch === ' ') return 0
  const c = ch.toUpperCase()
  const a = c.charCodeAt(0)
  if (a >= 65 && a <= 90) return a - 64
  if (c >= '1' && c <= '9') return 27 + (a - 49)
  if (c === '0') return 36
  const punct: Record<string, number> = {
    '!': 37, '@': 38, '#': 39, '$': 40, '(': 41, ')': 42, '-': 43, '+': 44,
    '&': 45, '=': 46, ';': 47, ':': 48, "'": 49, '"': 50, '%': 51, ',': 52,
    '.': 53, '/': 54, '?': 55,
  }
  return punct[c] ?? 0
}

function clean(line: unknown) {
  return String(line || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 !@#$()+\-&=;:'"%.,/?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, VB_COLS)
}

function textRow(line: string, width = VB_COLS) {
  const chars = [...clean(line)].map(code)
  const left = Math.max(0, Math.floor((width - chars.length) / 2))
  return [
    ...Array(left).fill(0),
    ...chars.slice(0, width),
    ...Array(Math.max(0, width - left - chars.length)).fill(0),
  ].slice(0, width)
}

function stripe(a: number, b: number) {
  return Array.from({ length: VB_COLS }, (_, i) => i % 2 === 0 ? a : b)
}

function framed(lines: string[], top: number, bottom: number) {
  return [
    stripe(top, bottom),
    textRow(lines[0] || ''),
    textRow(lines[1] || ''),
    textRow(lines[2] || ''),
    Array.from({ length: VB_COLS }, (_, i) => i % 2 === 0 ? top : 0),
    stripe(bottom, top),
  ]
}

function preview(characters: number[][]) {
  return characters.map(row => row.map(n => {
    if (n === 0 || n >= 63) return ' '
    if (n >= 1 && n <= 26) return String.fromCharCode(64 + n)
    if (n >= 27 && n <= 35) return String(n - 26)
    if (n === 36) return '0'
    return ''
  }).join('')).join('\n').trimEnd()
}

function pick<T>(items: T[], seed = Date.now()) {
  return items[Math.abs(Math.floor(seed / 1000 / 60)) % items.length]
}

function env(name: string, fallback = '') {
  return Deno.env.get(name)?.trim() || fallback
}

function provider(name: string, fallback: ProviderName): ProviderName {
  const value = env(name, fallback).toLowerCase()
  if (['worldcup2026', 'newsdata', 'newsapi', 'jokeapi', 'zenquotes', 'custom', 'local', 'off'].includes(value)) {
    return value as ProviderName
  }
  return fallback
}

function addParams(url: string, params: Record<string, string | undefined>) {
  const u = new URL(url)
  Object.entries(params).forEach(([key, value]) => {
    if (value) u.searchParams.set(key, value)
  })
  return u.toString()
}

async function fetchJson(url: string, key?: string, keyHeader = 'Authorization') {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (key) headers[keyHeader] = keyHeader.toLowerCase() === 'authorization' ? `Bearer ${key}` : key
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`feed ${res.status}`)
  return res.json()
}

function findArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const obj = data as Record<string, unknown>
  for (const key of ['matches', 'games', 'fixtures', 'events', 'data', 'results', 'articles', 'items']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }
  return []
}

function textValue(...values: unknown[]) {
  return values
    .map(value => {
      if (value == null) return ''
      if (typeof value === 'string' || typeof value === 'number') return String(value)
      if (typeof value === 'object') {
        const obj = value as Record<string, unknown>
        return String(obj.name || obj.shortName || obj.title || obj.en || '')
      }
      return ''
    })
    .find(Boolean) || ''
}

function scoreValue(item: Record<string, unknown>) {
  const homeScore = textValue(item.home_score, item.homeScore, item.home_goals, item.homeGoals, item.score1)
  const awayScore = textValue(item.away_score, item.awayScore, item.away_goals, item.awayGoals, item.score2)
  if (homeScore && awayScore) return `${homeScore}-${awayScore}`
  return textValue(item.score, item.result, item.fullTimeScore, item.status)
}

function isInterestingMatch(item: unknown) {
  if (!item || typeof item !== 'object') return false
  const obj = item as Record<string, unknown>
  const status = textValue(obj.status, obj.state, obj.match_status, obj.matchStatus).toLowerCase()
  return ['live', 'in progress', 'playing', 'halftime', 'finished', 'ft', 'full time'].some(s => status.includes(s))
}

function formatSportsItem(item: unknown) {
  if (!item || typeof item !== 'object') return null
  const obj = item as Record<string, unknown>
  const home = textValue(obj.home_team, obj.homeTeam, obj.team1, obj.home, obj.localteam, obj.home_name)
  const away = textValue(obj.away_team, obj.awayTeam, obj.team2, obj.away, obj.visitorteam, obj.away_name)
  const match = textValue(obj.match, obj.fixture, obj.game, obj.title) || (home && away ? `${home} V ${away}` : '')
  const score = scoreValue(obj)
  const clock = textValue(obj.clock, obj.minute, obj.time, obj.elapsed, obj.status, obj.match_status) || 'LIVE'
  if (!match || !score) return null
  return { match, score, clock }
}

async function buildSportsMessage(): Promise<FeedMessage | null> {
  const selected = provider('SPORTS_FEED_PROVIDER', 'worldcup2026')
  if (selected === 'off') return null
  const override = env('SPORTS_FEED_URL')
  const url = override || (selected === 'worldcup2026' ? 'https://worldcup26.ir/get/games' : '')
  if (!url) return null
  const data = await fetchJson(url, env('SPORTS_FEED_KEY') || undefined)
  const items = findArray(data)
  const picked = (items.find(isInterestingMatch) || items[0] || data) as unknown
  const formatted = formatSportsItem(picked)
  if (!formatted) return null
  const { match, score, clock } = formatted
  const characters = framed([match, score, clock], COLOR.GREEN, COLOR.WHITE)
  return { type: 'world_cup_score', characters, text: preview(characters) }
}

async function buildNewsMessage(): Promise<FeedMessage | null> {
  const selected = provider('NEWS_FEED_PROVIDER', 'custom')
  if (selected === 'off') return null
  const key = env('NEWS_FEED_KEY')
  const query = env('NEWS_FEED_QUERY', 'coffee OR football OR culture')
  const override = env('NEWS_FEED_URL')
  let url = override
  let header = 'Authorization'
  if (!url && selected === 'newsdata' && key) {
    url = addParams('https://newsdata.io/api/1/latest', {
      apikey: key,
      language: 'en',
      q: query,
    })
  }
  if (!url && selected === 'newsapi' && key) {
    url = addParams('https://newsapi.org/v2/top-headlines', {
      apiKey: key,
      language: 'en',
      q: query,
    })
  }
  if (!url) return null
  if (selected === 'newsapi') header = 'X-Api-Key'
  const data = await fetchJson(url, override ? key || undefined : undefined, header)
  const item = (findArray(data)[0] || data) as Record<string, unknown>
  const headline = textValue(item?.title, item?.headline)
  const source = textValue((item?.source as Record<string, unknown>)?.name, item?.source_id, item?.source) || 'NEWS'
  if (!headline) return null
  const characters = framed(['NEWS FLASH', headline, source], COLOR.BLUE, COLOR.WHITE)
  return { type: 'news_flash', characters, text: preview(characters) }
}

async function buildJokeMessage(): Promise<FeedMessage | null> {
  const selected = provider('JOKE_FEED_PROVIDER', 'jokeapi')
  if (selected === 'off') return null
  if (selected !== 'local') {
    const url = env('JOKE_FEED_URL') || 'https://v2.jokeapi.dev/joke/Any?safe-mode&type=twopart&blacklistFlags=nsfw,religious,political,racist,sexist,explicit'
    try {
      const data = await fetchJson(url)
      const setup = textValue(data.setup, data.joke, data.title)
      const punchline = textValue(data.delivery, data.punchline)
      if (setup) {
        const characters = framed([setup, punchline || 'NOCHI APPROVES', 'ORDER FIRST'], COLOR.YELLOW, COLOR.VIOLET)
        return { type: 'joke_break', characters, text: preview(characters) }
      }
    } catch (_) {
      // Fall through to local jokes.
    }
  }
  const joke = pick(JOKES)
  const characters = framed([joke.setup, joke.punchline, joke.cta], COLOR.YELLOW, COLOR.VIOLET)
  return { type: 'joke_break', characters, text: preview(characters) }
}

async function buildQuoteMessage(): Promise<FeedMessage | null> {
  const selected = provider('QUOTE_FEED_PROVIDER', 'zenquotes')
  if (selected === 'off') return null
  if (selected !== 'local') {
    const url = env('QUOTE_FEED_URL') || 'https://zenquotes.io/api/random'
    try {
      const data = await fetchJson(url)
      const item = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
      const quote = textValue(item.q, item.quote, item.content, item.text)
      const author = textValue(item.a, item.author) || 'QUOTE'
      if (quote) {
        const characters = framed([author, quote, 'THINK DEEPLY'], COLOR.VIOLET, COLOR.BLUE)
        return { type: 'quote_break', characters, text: preview(characters) }
      }
    } catch (_) {
      // Fall through to local quotes.
    }
  }
  const q = pick(QUOTES)
  const characters = framed([q.author, q.quote, q.cta], COLOR.VIOLET, COLOR.BLUE)
  return { type: 'quote_break', characters, text: preview(characters) }
}

async function buildFallbackMessage(): Promise<FeedMessage> {
  const now = Date.now()
  const useQuote = Math.floor(now / 1000 / 60 / 15) % 2 === 0
  if (useQuote) return await buildQuoteMessage() || await buildJokeMessage() || localQuote(now)
  return await buildJokeMessage() || await buildQuoteMessage() || localJoke(now)
}

function localJoke(seed = Date.now()): FeedMessage {
  const joke = pick(JOKES, seed)
  const characters = framed([joke.setup, joke.punchline, joke.cta], COLOR.YELLOW, COLOR.VIOLET)
  return { type: 'joke_break', characters, text: preview(characters) }
}

function localQuote(seed = Date.now()): FeedMessage {
  const q = pick(QUOTES, seed)
  const characters = framed([q.author, q.quote, q.cta], COLOR.VIOLET, COLOR.BLUE)
  return { type: 'quote_break', characters, text: preview(characters) }
}

function settingEnabled(settings: Record<string, AutomationSetting>, id: string, forceType?: string) {
  if (forceType === id) return true
  return settings[id]?.enabled === true
}

async function chooseMessage(settings: Record<string, AutomationSetting>, forceType?: string): Promise<FeedMessage | null> {
  if (forceType === 'quote_break') return await buildQuoteMessage() || localQuote()
  if (forceType === 'joke_break') return await buildJokeMessage() || localJoke()
  if (settingEnabled(settings, 'world_cup_score', forceType) && forceType !== 'news_flash') {
    try {
      const sports = await buildSportsMessage()
      if (sports) return sports
    } catch (_) {
      // Fall through to the next source.
    }
  }
  if (settingEnabled(settings, 'news_flash', forceType) && forceType !== 'world_cup_score') {
    try {
      const news = await buildNewsMessage()
      if (news) return news
    } catch (_) {
      // Fall through to safe local content.
    }
  }
  if (settingEnabled(settings, 'joke_break', forceType) || settingEnabled(settings, 'quote_break', forceType)) {
    return await buildFallbackMessage()
  }
  return null
}

async function sendVestaboard(message: FeedMessage) {
  const host = Deno.env.get('VESTABOARD_HOST')
  const key = Deno.env.get('VESTABOARD_API_KEY')
  if (!host && !key) return { simulated: true }
  const url = host ? `http://${host}:7000/local-api/message` : 'https://rw.vestaboard.com/'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (host && key) headers['X-Vestaboard-Local-Api-Enable-Key'] = key
  else if (key) headers['X-Vestaboard-Read-Write-Key'] = key
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ characters: message.characters }),
  })
  if (!res.ok) throw new Error(`Vestaboard ${res.status}: ${await res.text().catch(() => '')}`)
  return { simulated: false }
}

async function getAutomationProfileId(admin: ReturnType<typeof createClient>) {
  const configured = Deno.env.get('VESTABOARD_AUTOMATION_PROFILE_ID')
  if (configured) return configured
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

async function getAutomationSettings(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin
    .from('owner_settings')
    .select('value')
    .eq('key', VESTABOARD_AUTOMATION_SETTINGS_KEY)
    .maybeSingle()
  if (error) {
    console.warn('vestaboard settings skipped:', error.message)
    return {}
  }
  const rows = Array.isArray(data?.value) ? data.value : []
  return Object.fromEntries(rows.map((row: AutomationSetting) => [row.automation_id, row]))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const requestUrl = new URL(req.url)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const force =
      body.force === true ||
      body.force === 'true' ||
      requestUrl.searchParams.get('force') === '1' ||
      requestUrl.searchParams.get('force') === 'true'
    const forceType = typeof body.type === 'string'
      ? body.type
      : requestUrl.searchParams.get('type') || undefined

    if (!force && !isOperatingHours()) {
      return json({ ok: true, skipped: 'outside_operating_hours' })
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, key)

    if (!force) {
      const cutoff = new Date(Date.now() - MIN_SEND_INTERVAL_MINUTES * 60 * 1000).toISOString()
      const { data: recent } = await admin
        .from('vestaboard_messages')
        .select('id')
        .eq('status', 'sent')
        .gte('sent_at', cutoff)
        .limit(1)
      if (recent?.length) return json({ ok: true, skipped: 'rate_limited' })
    }

    const settings = await getAutomationSettings(admin)
    const message = await chooseMessage(settings, forceType)
    if (!message) return json({ ok: true, skipped: 'no_enabled_automation' })
    const result = await sendVestaboard(message)
    const submittedBy = await getAutomationProfileId(admin)

    if (submittedBy) {
      const { error } = await admin.from('vestaboard_messages').insert({
        message: message.text.slice(0, 132),
        submitted_by: submittedBy,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      if (error) console.warn('vestaboard log skipped:', error.message)
    }

    const settingRows = Object.values(settings)
    if (settingRows.length) {
      await admin
        .from('owner_settings')
        .upsert({
          key: VESTABOARD_AUTOMATION_SETTINGS_KEY,
          value: settingRows.map(setting => setting.automation_id === message.type
            ? { ...setting, last_sent_at: new Date().toISOString() }
            : setting),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
    }

    return json({ ok: true, type: message.type, simulated: result.simulated, logged: Boolean(submittedBy), text: message.text })
  } catch (err) {
    return json({ ok: false, error: (err as Error).message || 'internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
