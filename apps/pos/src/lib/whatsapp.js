import { supabase } from './supabase'

const PREFIX = '📋 *نوتشي - إدارة المهام*'

export async function sendWhatsApp(phone, message) {
  const body = `${PREFIX}\n\n${message}`
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: { to: phone, message: body },
  })
  if (error) throw new Error(error.message ?? 'Failed to send WhatsApp message')
  if (data?.error) throw new Error(data.error)
  return data
}

export async function sendWhatsAppWithImage(phone, message, imageUrl) {
  const body = `${PREFIX}\n\n${message}`
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: { to: phone, message: body, imageUrl },
  })
  if (error) throw new Error(error.message ?? 'Failed to send WhatsApp message')
  if (data?.error) throw new Error(data.error)
  return data
}

// Send an approved WhatsApp template (Twilio Content API). `variables` is a
// map like { "1": "value" } matching the template's {{1}} placeholders.
export async function sendWhatsAppTemplate(phone, contentSid, variables = null) {
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: { to: phone, contentSid, contentVariables: variables },
  })
  if (error) throw new Error(error.message ?? 'Failed to send WhatsApp template')
  if (data?.error) throw new Error(data.error)
  return data
}
