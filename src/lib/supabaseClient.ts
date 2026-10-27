import { createClient } from '@supabase/supabase-js'
import type { Database } from './db/database.types'

// `import.meta.env` is injected by Vite. Optional chaining keeps this module
// importable by the Node test runner, which has no Vite environment.
export const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL as string | undefined
export const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

/** True when Supabase credentials have been filled in (.env.local). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * Supabase client for the whole app. Created lazily so the app can show a
 * friendly setup screen before .env.local is filled in.
 */
let client: ReturnType<typeof createClient<Database>> | null = null

export function getSupabase() {
  if (!client) {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not configured. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      )
    }
    client = createClient<Database>(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
