import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_dialect_training_items'

export async function createTrainingItem(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateTrainingItem(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function trainDialect({ item, voiceProfile }) {
  const { data, error } = await supabase.functions.invoke('cs-train-dialect', {
    body: { item, voiceProfile },
  })
  if (error) {
    // Supabase wraps non-2xx as a generic FunctionsHttpError. The real error
    // body is on error.context (a Response). Unwrap it so the UI shows it.
    let detail = ''
    try {
      const resp = error.context
      if (resp && typeof resp.text === 'function') {
        const body = await resp.text()
        try {
          const parsed = JSON.parse(body)
          const parts = [parsed.error, parsed.detail, parsed.raw].filter(Boolean)
          detail = parts.length ? parts.join(' | raw: ') : body
        } catch { detail = body }
      }
    } catch { /* ignore */ }
    throw new Error(detail ? `${error.message} — ${detail.slice(0, 1500)}` : error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Scrape a Wattpad story into raw chapter text. Zero token cost.
export async function scrapeWattpad({ storyUrl, maxChapters = 50 }) {
  const { data, error } = await supabase.functions.invoke('cs-scrape-wattpad', {
    body: { storyUrl, maxChapters },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// Bulk-insert scraped chapters as pending training items.
// Returns the inserted rows.
export async function bulkInsertTrainingItems(rows) {
  if (!rows?.length) return []
  const { data, error } = await supabase
    .from('cs_dialect_training_items')
    .insert(rows)
    .select()
  if (error) throw error
  return data || []
}

// Convert a File object to base64 string for sending to the edge function.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      // Strip the data URL prefix ("data:image/jpeg;base64,") — edge function expects raw base64
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
