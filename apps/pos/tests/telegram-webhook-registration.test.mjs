import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const webhookUrl = new URL('../../../supabase/functions/telegram-webhook/index.ts', import.meta.url)

test('Telegram registration includes receipt message and button updates and reports delivery status', async () => {
  const source = await readFile(webhookUrl, 'utf8')
  assert.match(source, /allowed_updates: \['message', 'callback_query'\]/)
  assert.match(source, /tg\(botToken, 'getWebhookInfo', \{\}\)/)
  assert.match(source, /current\.url === fnUrl/)
  assert.match(source, /pending_update_count: current\.pending_update_count/)
  assert.match(source, /last_error_message: current\.last_error_message/)
  assert.doesNotMatch(source, /drop_pending_updates: true/)
})
