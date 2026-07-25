import { supabase } from '../../../lib/supabase'

async function evaluationError(error) {
  let message = error?.message || 'Content evaluation failed'
  const response = error?.context

  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json()
      if (typeof payload?.error === 'string') message = payload.error
      else if (typeof payload?.message === 'string') message = payload.message
    } catch {
      // Keep the SDK error when the Edge Function did not return JSON.
    }
  }

  if (/credit balance is too low|insufficient.*credit/i.test(message)) {
    message = 'Content evaluation is unavailable because the configured AI provider credits are exhausted.'
  }

  const readableError = new Error(message)
  readableError.cause = error
  return readableError
}

export async function evaluateDraft({ draft, voiceProfile }) {
  const { data, error } = await supabase.functions.invoke('cs-evaluate-draft', {
    body: { draft, voiceProfile },
  })
  if (error) throw await evaluationError(error)
  if (data?.error) throw new Error(data.error)
  return data
}
