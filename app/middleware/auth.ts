export default defineNuxtRouteMiddleware(() => {
  const { isAuthenticated, loading } = useAuth()

  if (loading.value) return

  if (!isAuthenticated.value) {
    return navigateTo('/login')
  }
})
