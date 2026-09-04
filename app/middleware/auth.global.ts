// The whole public site is open — no page requires an account. /admin is the
// only gated area and it carries its own `admin` middleware, so this global
// hook exists purely to bounce anonymous visitors off admin routes early.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  if (!to.path.startsWith('/admin')) return

  const { isAuthenticated, loading } = useAuth()
  if (loading.value) return
  if (!isAuthenticated.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
