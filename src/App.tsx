import { AuthProvider, useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { AuthScreen } from './components/AuthScreen'
import { LoadingScreen, SetupNotice } from './components/ScreenStates'
import { TrackerApp } from './TrackerApp'

function Gate() {
  const { ready, user } = useAuth()

  if (!isSupabaseConfigured) return <SetupNotice />
  if (!ready) return <LoadingScreen label="Checking your session…" />
  if (!user) return <AuthScreen />
  return <TrackerApp />
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
