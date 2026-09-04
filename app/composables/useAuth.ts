import type { Profile, UserRole } from '~/types'

interface AuthUser {
  id: string
  email?: string
}

interface AuthSession {
  access_token: string
  refresh_token: string
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  const profile = useState<Profile | null>('auth-profile', () => null)
  const session = useState<AuthSession | null>('auth-session', () => null)
  const loading = useState<boolean>('auth-loading', () => true)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const role = computed<UserRole | null>(() => profile.value?.role ?? null)

  async function fetchProfile() {
    const token = session.value?.access_token
    if (!token) return

    try {
      const { data } = await $fetch<{ data: Profile }>('/api/auth/profile', {
        headers: { Authorization: `Bearer ${token}` }
      })
      profile.value = data
    } catch {
      profile.value = null
    }
  }

  async function login(email: string, password: string) {
    try {
      const res = await $fetch<{ data: { user: AuthUser; session: AuthSession } }>('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      })

      user.value = res.data.user
      session.value = res.data.session
      persistSession(res.data.session)
      await fetchProfile()
      return { error: null }
    } catch (err: any) {
      return { error: err.data?.message || err.message || 'Login failed' }
    }
  }

  async function setSessionFromTokens(accessToken: string, refreshToken: string) {
    const s: AuthSession = { access_token: accessToken, refresh_token: refreshToken }
    session.value = s
    persistSession(s)
    try {
      const res = await $fetch<{ data: Profile }>('/api/auth/profile', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      user.value = { id: res.data.id, email: res.data.email }
      profile.value = res.data
      return { error: null }
    } catch (err: any) {
      session.value = null
      clearPersistedSession()
      return { error: err.data?.message || err.message || 'Failed to load profile' }
    }
  }

  async function logout() {
    const token = session.value?.access_token
    try {
      await $fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
    } catch {
      // Logout best-effort
    }
    user.value = null
    profile.value = null
    session.value = null
    clearPersistedSession()
  }

  function getAccessToken(): string | null {
    return session.value?.access_token ?? null
  }

  function authHeaders(): Record<string, string> {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  function persistSession(s: AuthSession) {
    if (import.meta.client) {
      localStorage.setItem('auth-session', JSON.stringify(s))
    }
  }

  function clearPersistedSession() {
    if (import.meta.client) {
      localStorage.removeItem('auth-session')
    }
  }

  async function initAuth(): Promise<void> {
    if (import.meta.server) {
      loading.value = false
      return
    }

    const stored = localStorage.getItem('auth-session')
    if (!stored) {
      loading.value = false
      return
    }

    let parsed: AuthSession
    try {
      parsed = JSON.parse(stored) as AuthSession
    } catch {
      clearPersistedSession()
      loading.value = false
      return
    }

    session.value = parsed
    try {
      const res = await $fetch<{ data: Profile }>('/api/auth/profile', {
        headers: { Authorization: `Bearer ${parsed.access_token}` }
      })
      user.value = { id: res.data.id, email: res.data.email }
      profile.value = res.data
    } catch {
      user.value = null
      profile.value = null
      session.value = null
      clearPersistedSession()
    } finally {
      loading.value = false
    }
  }

  async function refreshProfile() {
    await fetchProfile()
  }

  return {
    user,
    profile,
    loading,
    isAuthenticated,
    isAdmin,
    role,
    login,
    setSessionFromTokens,
    logout,
    getAccessToken,
    authHeaders,
    initAuth,
    refreshProfile
  }
}
