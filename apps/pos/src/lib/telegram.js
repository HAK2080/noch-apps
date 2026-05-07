import { supabase } from './supabase'

/**
 * Send a Telegram message and optionally track it for reply linking
 * @param {string} chatId - Telegram chat ID
 * @param {string} message - Message text to send
 * @param {string} [taskId] - Optional task ID to link replies back to this task
 * @returns {Promise<object>} Response with messageId and status
 */
export async function sendTelegram(chatId, message, taskId) {
  const { data, error } = await supabase.functions.invoke('send-telegram', {
    body: { chat_id: chatId, message },
  })
  if (error) throw new Error(error.message ?? 'Failed to send Telegram message')
  if (data?.error) throw new Error(data.error)

  // If taskId provided, store message in telegram_messages for reply linking
  if (taskId && data?.messageId) {
    try {
      // Use upsert to handle duplicate key gracefully
      const { error: upsertError } = await supabase
        .from('telegram_messages')
        .upsert(
          {
            task_id: taskId,
            chat_id: String(chatId),
            message_id: data.messageId,
          },
          { onConflict: 'chat_id,message_id' }
        )
      if (upsertError) {
        console.warn('Failed to track telegram message:', upsertError)
      } else {
        console.log('Message tracked:', { taskId, chatId, messageId: data.messageId })
      }
    } catch (err) {
      // Non-blocking: log but don't fail the send
      console.warn('Error tracking telegram message:', err)
    }
  }

  return data
}
