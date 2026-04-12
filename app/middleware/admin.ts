export default defineNuxtRouteMiddleware(() => {
  // Auth is already enforced by auth.global.ts; this only gates admin-role.
  const { isAdmin, loading } = useAuth()
  if (loading.value) return
  if (!isAdmin.value) return navigateTo('/')
})
