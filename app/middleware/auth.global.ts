const PUBLIC_EXACT = new Set(['/', '/search', '/login', '/register', '/pricing', '/terms', '/privacy', '/auth/callback'])

function isPublic(path: string): boolean {
  if (PUBLIC_EXACT.has(path)) return true
  // Recipe detail pages are public; server decides what to return.
  if (path.startsWith('/recipe/')) return true
  return false
}

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  if (isPublic(to.path)) return

  const { isAuthenticated, loading } = useAuth()
  if (loading.value) return
  if (!isAuthenticated.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
