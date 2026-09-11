// Browser-owned locks avoid localStorage races and expire automatically when
// a tab closes/crashes. No heartbeat expiry that can unlock a sleeping tablet.
export function watchPOSInstance(branchId, enabled, onState, locks = globalThis.navigator?.locks) {
  if (!enabled) {
    onState('allowed')
    return () => {}
  }
  if (!locks) {
    onState('unsupported')
    return () => {}
  }

  const controller = new AbortController()
  let release
  let stopped = false
  onState('waiting')
  locks.request(`noch-pos-terminal:${branchId}`, { signal: controller.signal }, async () => {
    if (stopped) return
    const held = new Promise(resolve => { release = resolve })
    onState('allowed')
    await held
  }).catch(error => {
    if (!stopped && error.name !== 'AbortError') onState('error')
  })

  return () => {
    stopped = true
    controller.abort()
    release?.()
  }
}
