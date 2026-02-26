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

  async function register(email: string, password: string, displayName?: string) {
    try {
      const res = await $fetch<{ data: { user: AuthUser; session: AuthSession } }>('/api/auth/register', {
        method: 'POST',
        body: { email, password, displayName }
      })

      user.value = res.data.user
      session.value = res.data.session
      persistSession(res.data.session)
      await fetchProfile()
      return { error: null }
    } catch (err: any) {
      return { error: err.data?.message || err.message || 'Registration failed' }
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

  function initAuth() {
    if (import.meta.server) {
      loading.value = false
      return
    }

    const stored = localStorage.getItem('auth-session')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AuthSession
        session.value = parsed
        // Validate the token by fetching profile
        $fetch<{ data: Profile }>('/api/auth/profile', {
          headers: { Authorization: `Bearer ${parsed.access_token}` }
        }).then((res) => {
          user.value = { id: res.data.id, email: res.data.email }
          profile.value = res.data
          loading.value = false
        }).catch(() => {
          // Token expired or invalid
          user.value = null
          profile.value = null
          session.value = null
          clearPersistedSession()
          loading.value = false
        })
      } catch {
        clearPersistedSession()
        loading.value = false
      }
    } else {
      loading.value = false
    }
  }

  return {
    user,
    profile,
    loading,
    isAuthenticated,
    isAdmin,
    role,
    login,
    register,
    logout,
    getAccessToken,
    authHeaders,
    initAuth
  }
}
