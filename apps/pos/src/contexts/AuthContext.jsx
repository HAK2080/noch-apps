/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProfile } from '../lib/profiles'
import { cacheProfile, getCachedProfile } from '../lib/profile-cache'
import { withAuthBootstrapTimeout } from '../lib/auth-bootstrap'

const AuthContext = createContext({})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId, { cached = null } = {}) {
    try {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Profile refresh timed out')), 6000)
      })
      const p = await Promise.race([getProfile(userId), timeout])
      cacheProfile(userId, p)
      setProfile(p)
      return p
    } catch {
      const fallback = cached || getCachedProfile(userId)
      setProfile(fallback)
      return fallback
    }
  }

  useEffect(() => {
    // getSession had no rejection handler. When Supabase is unreachable it
    // rejects, which left loading stuck on true AND raised an unhandled
    // rejection — the exact condition index.html answers with the
    // "Noch could not open" recovery screen. A transient backend problem must
    // not cost the staff their login form, so failure now simply means
    // "no session yet" and the app opens.
    withAuthBootstrapTimeout(supabase.auth.getSession()).then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const cached = getCachedProfile(session.user.id)
        if (cached) {
          // Let a known café device open immediately; refresh access in the
          // background and replace the cache whenever the network responds.
          setProfile(cached)
          setLoading(false)
        }
        await loadProfile(session.user.id, { cached })
      }
      setLoading(false)
    }).catch(() => {
      // onAuthStateChange still fires if the connection recovers, so a signed-in
      // device picks its session back up without a reload.
      setLoading(false)
    })

    let lastLoadedUserId = null
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null
      setUser(session?.user ?? null)
      if (session?.user) {
        // Skip refetch on TOKEN_REFRESHED / USER_UPDATED for the same user.
        if (newUserId === lastLoadedUserId) return
        lastLoadedUserId = newUserId
        const cached = getCachedProfile(session.user.id)
        if (cached) setProfile(cached)
        setLoading(!cached)
        loadProfile(session.user.id, { cached }).finally(() => setLoading(false))
      } else {
        lastLoadedUserId = null
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Set user + profile immediately so ProtectedRoute sees them before navigate('/') fires.
    // onAuthStateChange will also fire but user/profile will already be correct.
    if (data.user) {
      setUser(data.user)
      await loadProfile(data.user.id)
    }
    return data
  }

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    // Manually create profile since trigger may not be set up
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: email.split('@')[0],
        role: 'staff',
      })
    }
    return data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const isOwner = profile?.role === 'owner'

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOwner, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
