// print-queue.js — multi-tablet print queue
//
// Any tablet enqueues print jobs to pos_print_queue. The designated
// "host" tablet (the one with the Bluetooth printer paired) subscribes
// via Realtime, atomically claims pending jobs via the claim_print_jobs
// RPC, and prints them locally using the *Direct variants in escpos.js.
//
// Settings on each tablet:
//   localStorage 'noch_is_print_host' = '1' → tablet is the print host
//   localStorage 'noch_device_id'           → per-tablet stable id (auto-generated)
//
// Failure modes the operator should be aware of:
//   - Host tablet offline / asleep → jobs sit pending, won't print until host wakes
//   - Multiple hosts → SKIP LOCKED in claim_print_jobs ensures no duplicate prints

import { supabase } from '../../../lib/supabase'
import {
  printReceiptDirect,
  printDrinkTicketDirect,
  isPrinterConnected,
} from './escpos'

const HOST_KEY = 'noch_is_print_host'
const DEVICE_ID_KEY = 'noch_device_id'

// ── Device identity ─────────────────────────────────────────────────
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = `tab-${crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// ── Host toggle ─────────────────────────────────────────────────────
export function isPrintHost() {
  return localStorage.getItem(HOST_KEY) === '1'
}

export function setPrintHost(on) {
  if (on) localStorage.setItem(HOST_KEY, '1')
  else localStorage.removeItem(HOST_KEY)
}

// ── Enqueue ─────────────────────────────────────────────────────────
export async function enqueuePrintJob(branchId, jobType, payload) {
  if (!branchId) throw new Error('enqueuePrintJob: branchId required')
  const { data, error } = await supabase
    .from('pos_print_queue')
    .insert({ branch_id: branchId, job_type: jobType, payload })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// ── Host subscriber ─────────────────────────────────────────────────
let _channel = null
let _presenceChannel = null
let _processing = false
let _activeBranchId = null

export function startHostSubscriber(branchId) {
  if (!branchId) return
  if (_channel && _activeBranchId === branchId) return
  stopHostSubscriber()

  _activeBranchId = branchId

  // Drain any pending jobs already in queue
  processQueue(branchId)

  _channel = supabase
    .channel(`print-queue-${branchId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'pos_print_queue',
        filter: `branch_id=eq.${branchId}`,
      },
      () => { processQueue(branchId) }
    )
    .subscribe()

  // Presence: announce this tablet is the active host for the branch.
  // Other tablets observing the same channel will see us in their
  // presence state and can display a green/red indicator.
  _presenceChannel = supabase.channel(`print-host-${branchId}`, {
    config: { presence: { key: getDeviceId() } },
  })
  _presenceChannel
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await _presenceChannel.track({
          deviceId: getDeviceId(),
          role: 'host',
          since: new Date().toISOString(),
        })
      }
    })
}

export function stopHostSubscriber() {
  if (_channel) {
    try { supabase.removeChannel(_channel) } catch {}
    _channel = null
  }
  if (_presenceChannel) {
    try {
      _presenceChannel.untrack()
      supabase.removeChannel(_presenceChannel)
    } catch {}
    _presenceChannel = null
  }
  _activeBranchId = null
}

// ── Presence observer (used by non-host tablets to see host status) ─
export function observeHostPresence(branchId, onChange) {
  if (!branchId) return () => {}
  const channel = supabase.channel(`print-host-${branchId}`, {
    config: { presence: { key: `observer-${getDeviceId()}` } },
  })
  const emit = () => {
    const state = channel.presenceState()
    // Find any entry that declares role === 'host'
    let host = null
    for (const key of Object.keys(state)) {
      const arr = state[key] || []
      for (const p of arr) {
        if (p?.role === 'host') { host = p; break }
      }
      if (host) break
    }
    onChange(host)
  }
  channel
    .on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'join' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // We track ourselves as an observer (no role) so we appear
        // in our own presence state and trigger the initial sync.
        await channel.track({ deviceId: getDeviceId(), role: 'observer' })
      }
    })
  return () => {
    try {
      channel.untrack()
      supabase.removeChannel(channel)
    } catch {}
  }
}

async function processQueue(branchId) {
  if (_processing) return
  if (!isPrinterConnected()) {
    console.warn('[print-queue] host printer not connected — skipping drain')
    return
  }
  _processing = true
  try {
    const deviceId = getDeviceId()
    while (true) {
      const { data: jobs, error } = await supabase.rpc('claim_print_jobs', {
        p_branch_id: branchId,
        p_host_device_id: deviceId,
        p_limit: 1,
      })
      if (error) { console.warn('[print-queue] claim failed', error); break }
      if (!jobs || jobs.length === 0) break

      const job = jobs[0]
      try {
        await runJob(job)
        await supabase
          .from('pos_print_queue')
          .update({ status: 'done', completed_at: new Date().toISOString() })
          .eq('id', job.id)
      } catch (err) {
        console.error('[print-queue] job failed', job.id, err)
        await supabase
          .from('pos_print_queue')
          .update({
            status: 'failed',
            error: String(err?.message || err).slice(0, 500),
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id)
      }
    }
  } finally {
    _processing = false
  }
}

async function runJob(job) {
  const p = job.payload || {}
  if (job.job_type === 'receipt') {
    await printReceiptDirect(p.order, p.branch, p.items, p.loyaltyCustomer || null)
  } else if (job.job_type === 'drink_ticket') {
    await printDrinkTicketDirect(p.order, p.items, p.branch, p.opts || {})
  } else if (job.job_type === 'test') {
    // Reserved for a future "test print from queue" feature
    throw new Error('test job type not implemented')
  } else {
    throw new Error(`unknown job_type: ${job.job_type}`)
  }
}

// ── Helper: wait for a job to finish (for UX on enqueueing tablet) ──
// Polls the row until status leaves 'pending'/'printing'. Resolves with
// the final status string. Times out after timeoutMs (default 15s).
export async function waitForJob(jobId, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase
      .from('pos_print_queue')
      .select('status, error')
      .eq('id', jobId)
      .single()
    if (error) throw error
    if (data.status === 'done' || data.status === 'failed') return data
    await new Promise(r => setTimeout(r, 500))
  }
  return { status: 'timeout', error: 'No host picked up the job within 15s' }
}
