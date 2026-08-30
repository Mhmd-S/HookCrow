export function useCanonical(path?: string) {
  const route = useRoute()
  const { public: pub } = useRuntimeConfig()
  const siteUrl = (pub.siteUrl || '').replace(/\/$/, '')

  // Normalise so /Pricing, /pricing/ and /pricing all canonicalise to one URL
  // rather than each self-canonicalising to its own literal path.
  const raw = path ?? route.path
  const normalised = raw.toLowerCase().replace(/\/+$/, '') || '/'
  const href = `${siteUrl}${normalised}`

  useHead({
    link: [{ rel: 'canonical', href }]
  })

  // og:url is a separate signal from rel=canonical and was missing everywhere.
  useSeoMeta({ ogUrl: href })
}
