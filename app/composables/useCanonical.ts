export function useCanonical(path?: string) {
  const route = useRoute()
  const { public: pub } = useRuntimeConfig()
  const siteUrl = (pub.siteUrl || '').replace(/\/$/, '')
  useHead({
    link: [{ rel: 'canonical', href: `${siteUrl}${path ?? route.path}` }]
  })
}
