import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  async function signUp({ email, password, first_name, last_name, phone_number, venmo_username }) {
    const name = `${first_name} ${last_name}`.trim()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) throw error

    if (data.user) {
      await supabase
        .from('users')
        .update({ name, first_name, last_name, phone_number, venmo_username })
        .eq('id', data.user.id)
    }
    return data
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function updateProfile({ first_name, last_name, phone_number, venmo_username }) {
    if (!session) return
    const name = `${first_name} ${last_name}`.trim()
    await supabase.auth.updateUser({ data: { name } })
    const { error } = await supabase
      .from('users')
      .update({ name, first_name, last_name, phone_number, venmo_username })
      .eq('id', session.user.id)
    if (error) throw error
    await fetchProfile(session.user.id)
  }

  async function updateEmail(email) {
    const { error } = await supabase.auth.updateUser({ email })
    if (error) throw error
  }

  async function updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }

  // Convenience: is the current user an admin?
  // We use a simple email allow-list via env var: VITE_ADMIN_EMAILS=a@b.com,c@d.com
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim())
  const isAdmin = session?.user?.email && adminEmails.includes(session.user.email)

  return (
    <AuthContext.Provider value={{ session, profile, isAdmin, signUp, signIn, signOut, updateProfile, updateEmail, updatePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
