export const GROUP_MATCHES_KEY = 'noch_group_listener_matches_v1'

function facebookGroupUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !['www.facebook.com', 'web.facebook.com'].includes(url.hostname)) return ''
    if (!/^\/groups\/[^/]+/.test(url.pathname)) return ''
    return url.href
  } catch { return '' }
}

export function normalizeGroupMatch(value) {
  if (!value || !/^post-[a-f0-9]+$/.test(value.id || '')) return null
  const groupUrl = facebookGroupUrl(value.groupUrl)
  const url = value.url ? facebookGroupUrl(value.url) : ''
  const text = String(value.text || '').trim().slice(0, 4000)
  if (!groupUrl || text.length < 25) return null
  return {
    id: value.id, groupUrl, url, text,
    groupName: String(value.groupName || 'Facebook Group').slice(0, 160),
    keywords: Array.isArray(value.keywords) ? value.keywords.map(String).slice(0, 20) : [],
    areas: Array.isArray(value.areas) ? value.areas.map(String).slice(0, 20) : [],
    foundAt: Number.isFinite(Date.parse(value.foundAt)) ? value.foundAt : new Date().toISOString(),
    replyDraft: '', approvedReply: '', history: [], promotedBy: {},
  }
}

export function loadGroupMatches(storage = window.localStorage) {
  try {
    const rows = JSON.parse(storage.getItem(GROUP_MATCHES_KEY) || '[]')
    return Array.isArray(rows) ? rows : []
  } catch { return [] }
}

export function storeGroupMatches(rows, storage = window.localStorage) {
  storage.setItem(GROUP_MATCHES_KEY, JSON.stringify(rows.slice(0, 200)))
}

export function ingestGroupMatch(value, storage = window.localStorage) {
  const match = normalizeGroupMatch(value)
  if (!match) throw new Error('Invalid Facebook Group match')
  const rows = loadGroupMatches(storage)
  if (!rows.some(row => row.id === match.id)) storeGroupMatches([match, ...rows], storage)
  return loadGroupMatches(storage)
}
