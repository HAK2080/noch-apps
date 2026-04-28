// Generic form-draft persistence — survives navigation, tab close, browser crash.
// Keyed by `<entity>:<id-or-new>` so each module gets its own namespace.
// Drafts auto-expire after 24h.

const PREFIX = 'noch.draft.'
const TTL_MS = 24 * 60 * 60 * 1000

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d?.savedAt || Date.now() - d.savedAt > TTL_MS) {
      localStorage.removeItem(PREFIX + key)
      return null
    }
    return d
  } catch { return null }
}

export function saveDraft(key, form, label) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ form, label, savedAt: Date.now() }))
  } catch {}
}

export function clearDraft(key) {
  try { localStorage.removeItem(PREFIX + key) } catch {}
}

// List drafts whose key starts with `<entity>:`. Pass entity='product' to get
// just product drafts; omit to get every draft in the namespace.
export function listDrafts(entity) {
  const out = []
  const filterPrefix = entity ? PREFIX + entity + ':' : PREFIX
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(filterPrefix)) continue
      const key = k.slice(PREFIX.length)
      const d = loadDraft(key)
      if (d) out.push({ key, ...d })
    }
  } catch {}
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

export function draftAge(savedAt) {
  const mins = Math.floor((Date.now() - savedAt) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}
