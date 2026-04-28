import { supabase } from './supabase'

const PREFIX = '📋 *نوتشي - إدارة المهام*'

// Free-text WhatsApp. In production this only succeeds inside the 24h
// customer-service window — for outbound outside that window, use
// sendWhatsAppTemplate with a Meta-approved template name.
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

// Template message — required for production outbound outside 24h window.
// templateName must match a key in send-whatsapp/index.ts TEMPLATE_SIDS,
// templateVariables maps "1", "2", ... to the substitution values.
// Example:
//   sendWhatsAppTemplate('+218..', 'order_ready_pickup', { '1': 'Ahmed', '2': 'A4F7' })
export async function sendWhatsAppTemplate(phone, templateName, templateVariables = {}) {
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: { to: phone, templateName, templateVariables },
  })
  if (error) throw new Error(error.message ?? 'Failed to send WhatsApp template')
  if (data?.error) throw new Error(data.error)
  return data
}
