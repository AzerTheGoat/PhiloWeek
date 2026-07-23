import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import * as api from '@/services/api'

type AuthContextValue = {
  user: api.MobileUser | null
  token: string | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signUp: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.MobileUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api.getStoredToken()
      .then(async stored => {
        if (!stored) return
        const currentUser = await api.getMe(stored)
        if (active) { setToken(stored); setUser(currentUser) }
      })
      .catch(() => api.clearStoredToken())
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const applySession = async (session: api.MobileUser & { token: string }) => {
    await api.saveToken(session.token)
    setToken(session.token)
    setUser({ id: session.id, username: session.username })
  }

  const value = useMemo<AuthContextValue>(() => ({
    user, token, loading,
    signIn: async (username, password) => applySession(await api.login(username, password)),
    signUp: async (username, password) => applySession(await api.register(username, password)),
    signOut: async () => {
      if (token) await api.logout(token).catch(() => undefined)
      await api.clearStoredToken()
      setToken(null)
      setUser(null)
    },
  }), [user, token, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth doit etre utilise dans AuthProvider.')
  return value
}
