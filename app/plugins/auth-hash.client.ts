export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined') return

  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  if (!hash) return

  const params = new URLSearchParams(hash)
  const hasAuthPayload = params.has('access_token') || params.has('error_code') || params.has('error')
  if (!hasAuthPayload) return

  if (window.location.pathname === '/auth/callback') return

  const router = useRouter()
  router.replace({ path: '/auth/callback', hash: `#${hash}` })
})
