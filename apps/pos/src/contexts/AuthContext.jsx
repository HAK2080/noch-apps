import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getProfile } from '../lib/supabase'

const AuthContext = createContext({})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    try {
      const p = await getProfile(userId)
      setProfile(p)
    } catch {
      setProfile(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) await loadProfile(session.user.id)
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
        setLoading(true)
        loadProfile(session.user.id).finally(() => setLoading(false))
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

  const signInWithPIN = async (pin) => {
    if (!pin || pin.length < 4 || pin.length > 6) throw new Error('PIN must be 4-6 digits')
    // Call edge function which uses verify_pos_pin RPC
    const { data, error } = await supabase.functions.invoke('sign-in-with-pin', {
      body: { pin }
    })
    if (error) {
      // Check for rate limiting error
      if (error.message?.includes('429') || data?.locked) {
        const retryIn = data?.retry_in_seconds || 900
        throw new Error(`Too many failed attempts. Try again in ${Math.ceil(retryIn / 60)} minutes.`)
      }
      throw error
    }
    if (data?.error) throw new Error(data.error)
    // On success, set user and profile from the returned session
    if (data?.user) {
      setUser(data.user)
      await loadProfile(data.user.id)
    }
    return data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const isOwner = profile?.role === 'owner'

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOwner, signIn, signInWithPIN, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
