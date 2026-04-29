import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_PREFIX = 'noch.session.form.'
const RESTORE_DELAY_MS = 60
const SKIP_PATHS = ['/login', '/menu', '/checkout', '/order/confirmation', '/loyalty/me']

function pathKey(pathname) {
  return STORAGE_PREFIX + pathname.replace(/\/+/g, '_').replace(/^_|_$/g, '')
}

function elementKey(el) {
  if (el.dataset && el.dataset.preserveKey) return el.dataset.preserveKey
  if (el.name) return 'n:' + el.name
  if (el.id) return 'i:' + el.id
  if (el.getAttribute('aria-label')) return 'a:' + el.getAttribute('aria-label')
  if (el.placeholder) return 'p:' + el.placeholder
  return null
}

function shouldSkipElement(el) {
  if (!el || !el.tagName) return true
  if (el.dataset?.noPreserve != null) return true
  if (el.disabled || el.readOnly) return true
  const tag = el.tagName.toLowerCase()
  if (tag === 'input') {
    const type = (el.type || 'text').toLowerCase()
    if (['password', 'file', 'submit', 'button', 'reset', 'hidden', 'image'].includes(type)) return true
  } else if (tag !== 'textarea' && tag !== 'select') {
    return true
  }
  return false
}

function readValue(el) {
  if (el.tagName.toLowerCase() === 'input') {
    const type = (el.type || 'text').toLowerCase()
    if (type === 'checkbox' || type === 'radio') return el.checked ? '1' : ''
  }
  return el.value ?? ''
}

function writeValue(el, val) {
  const tag = el.tagName.toLowerCase()
  if (tag === 'input') {
    const type = (el.type || 'text').toLowerCase()
    if (type === 'checkbox' || type === 'radio') {
      el.checked = val === '1'
    } else {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter ? setter.call(el, val) : (el.value = val)
    }
  } else if (tag === 'textarea') {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    setter ? setter.call(el, val) : (el.value = val)
  } else if (tag === 'select') {
    el.value = val
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function loadSnapshot(key) {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveSnapshot(key, snap) {
  try {
    if (Object.keys(snap).length === 0) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(snap))
  } catch {
    /* quota or private mode — silently drop */
  }
}

export default function FormStatePreserver() {
  const { pathname } = useLocation()
  const snapshotRef = useRef({})
  const keyRef = useRef('')

  useEffect(() => {
    if (SKIP_PATHS.some(p => pathname.startsWith(p))) return

    const key = pathKey(pathname)
    keyRef.current = key
    snapshotRef.current = loadSnapshot(key)

    const restoreTimer = setTimeout(() => {
      const snap = snapshotRef.current
      if (!snap || Object.keys(snap).length === 0) return
      const elements = document.querySelectorAll('input, textarea, select')
      elements.forEach(el => {
        if (shouldSkipElement(el)) return
        const eKey = elementKey(el)
        if (!eKey || !(eKey in snap)) return
        const stored = snap[eKey]
        if (readValue(el) === stored) return
        writeValue(el, stored)
      })
    }, RESTORE_DELAY_MS)

    function handleChange(e) {
      const el = e.target
      if (shouldSkipElement(el)) return
      const eKey = elementKey(el)
      if (!eKey) return
      const val = readValue(el)
      if (val === '' || val == null) {
        delete snapshotRef.current[eKey]
      } else {
        snapshotRef.current[eKey] = val
      }
      saveSnapshot(key, snapshotRef.current)
    }

    document.addEventListener('input', handleChange, true)
    document.addEventListener('change', handleChange, true)

    return () => {
      clearTimeout(restoreTimer)
      document.removeEventListener('input', handleChange, true)
      document.removeEventListener('change', handleChange, true)
    }
  }, [pathname])

  return null
}
