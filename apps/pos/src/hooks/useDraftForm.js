// useDraftForm — drop-in replacement for useState in modals/forms.
// Persists the form state to localStorage under a stable key so partial
// entries survive tab switches, refreshes, and accidental modal closes.
//
// Usage:
//   const [form, setForm, clearDraft] = useDraftForm('noch:suppliers:new', BLANK)
//   ...inputs bind to form.field; setForm({ ...form, field: v }) saves automatically
//   ...on successful submit OR explicit cancel, call clearDraft()
//
// Convention: key = `noch:<module>:<intent>` (e.g. `noch:product:new`,
// `noch:recipe:edit:<id>`). Always namespace with `noch:` to avoid collisions.
//
// When `disabled` is true the hook behaves like a plain useState — used for
// edit flows where reusing a draft from a different record would be wrong.

import { useState, useEffect, useRef, useCallback } from 'react'

export function useDraftForm(key, initial, { disabled = false } = {}) {
  const [state, setState] = useState(() => {
    if (disabled) return typeof initial === 'function' ? initial() : initial
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        const base = typeof initial === 'function' ? initial() : initial
        return { ...base, ...parsed }
      }
    } catch {}
    return typeof initial === 'function' ? initial() : initial
  })

  const keyRef = useRef(key)
  useEffect(() => { keyRef.current = key }, [key])

  useEffect(() => {
    if (disabled) return
    try { localStorage.setItem(keyRef.current, JSON.stringify(state)) } catch {}
  }, [state, disabled])

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(keyRef.current) } catch {}
  }, [])

  return [state, setState, clearDraft]
}
