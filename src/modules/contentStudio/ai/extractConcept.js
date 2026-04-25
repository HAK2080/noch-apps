import { supabase } from '../../../lib/supabase'

async function fetchImageAsBase64(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`)
  const blob = await res.blob()
  const mimeType = blob.type || 'image/jpeg'
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return { base64, mimeType }
}

export async function extractConcept({ inspiration, voiceProfile }) {
  let image = null
  if (inspiration?.preview_image_url) {
    try {
      image = await fetchImageAsBase64(inspiration.preview_image_url)
    } catch (e) {
      console.warn('Could not convert image to base64, will send URL only:', e)
    }
  }

  const { data, error } = await supabase.functions.invoke('cs-extract-concept', {
    body: { inspiration, voiceProfile, image },
  })
  if (error) throw error
  return data
}
