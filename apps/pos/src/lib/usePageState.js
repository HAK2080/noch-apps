import { useEffect, useState } from 'react'

// Module-level in-memory store. Lives for the lifetime of the browser tab.
// Cleared when the tab closes or the app reloads. Holds any JS value
// including Files/Blobs that can't be serialized to storage.
const store = new Map()

export function getPageState(key) {
  return store.get(key)
}

export function setPageState(key, value) {
  store.set(key, value)
}

export function clearPageState(key) {
  store.delete(key)
}

// Drop-in replacement for useState that persists across component unmount
// (e.g. when React Router switches routes). Scoped per `key` — use unique
// page-scoped keys like 'dialect-trainer:files'.
//
// Pattern:
//   const [files, setFiles] = usePageState('dialect-trainer:files', [])
//
// Initial value is only used the first time the key is seen.
export function usePageState(key, initial) {
  const [state, setState] = useState(() => {
    if (store.has(key)) return store.get(key)
    const v = typeof initial === 'function' ? initial() : initial
    store.set(key, v)
    return v
  })

  useEffect(() => {
    store.set(key, state)
  }, [key, state])

  return [state, setState]
}
