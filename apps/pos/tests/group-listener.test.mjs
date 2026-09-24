import test from 'node:test'
import assert from 'node:assert/strict'
import { ingestGroupMatch, normalizeGroupMatch } from '../src/modules/contentStudio/lib/groupListener.js'

const match = {
  id: 'post-1a2b', groupUrl: 'https://www.facebook.com/groups/coffee',
  url: 'https://www.facebook.com/groups/coffee/posts/123',
  groupName: 'Tripoli coffee', text: 'Where can I find good coffee in Tripoli today?',
  keywords: ['coffee'], areas: ['Tripoli'], foundAt: '2026-09-24T10:00:00.000Z',
}

function storage() {
  const data = new Map()
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) }
}

test('accepts a Facebook Group match once and preserves review edits on retry', () => {
  const saved = storage()
  const [first] = ingestGroupMatch(match, saved)
  assert.equal(first.text, match.text)
  assert.equal(first.approvedReply, '')
  saved.setItem('noch_group_listener_matches_v1', JSON.stringify([{ ...first, replyDraft: 'My reply' }]))
  const rows = ingestGroupMatch(match, saved)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].replyDraft, 'My reply')
})

test('rejects a non-Group URL even when the rest of a match looks valid', () => {
  assert.equal(normalizeGroupMatch({ ...match, groupUrl: 'https://example.com/groups/coffee' }), null)
  assert.equal(normalizeGroupMatch({ ...match, groupUrl: 'https://www.facebook.com/profile.php' }), null)
})
