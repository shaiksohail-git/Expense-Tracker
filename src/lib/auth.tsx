import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'

/**
 * Session handling for the whole app.
 * The Supabase client persists the session in localStorage and refreshes it
 * automatically; this provider simply mirrors it into React.
 */

interface AuthValue {
  /** False while the stored session is being restored. */
  ready: boolean
  user: User | null
  signIn: (email: string, password: string) => Promise<void>
  /** Resolves `{ needsConfirmation: true }` when Supabase requires an email click. */
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/** Translate Supabase auth errors into plain sentences. */
export function friendlyAuthError(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error ?? '')

  if (/invalid login credentials/i.test(message)) {
    return 'That email and password do not match an account.'
  }
  if (/email not confirmed/i.test(message)) {
    return 'Please confirm your email first — check your inbox for the link.'
  }
  if (/user already registered|already been registered/i.test(message)) {
    return 'An account with this email already exists. Sign in instead.'
  }
  if (/password should be at least/i.test(message)) {
    return 'Use a password with at least 8 characters.'
  }
  if (/unable to validate email|invalid email/i.test(message)) {
    return 'Enter a valid email address.'
  }
  if (/for security purposes/i.test(message)) {
    return 'Too many attempts. Wait a minute, then try again.'
  }
  if (/signups? not allowed|signup is disabled/i.test(message)) {
    return 'New sign-ups are turned off for this project. Enable email sign-ups in Supabase.'
  }
  if (/rate limit/i.test(message)) {
    return 'Too many attempts. Wait a moment, then try again.'
  }
  if (/failed to fetch|networkerror/i.test(message)) {
    return 'Could not reach Supabase. Check your connection and try again.'
  }
  return message || 'Something went wrong. Please try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = getSupabase()
    let alive = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return
        setUser(data.session?.user ?? null)
        setReady(true)
      })
      .catch(() => {
        if (alive) setReady(true)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setReady(true)
    })

    return () => {
      alive = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw new Error(friendlyAuthError(error))
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
    })
    if (error) throw new Error(friendlyAuthError(error))
    // With email confirmation enabled Supabase returns a user but no session.
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut()
    if (error) throw new Error(friendlyAuthError(error))
  }, [])

  const value = useMemo(
    () => ({ ready, user, signIn, signUp, signOut }),
    [ready, user, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
