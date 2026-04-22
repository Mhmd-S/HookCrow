import type { H3Event } from 'h3'

export function getRequestSiteUrl(event: H3Event): string {
  const origin = getHeader(event, 'origin')
  if (origin) return origin.replace(/\/$/, '')

  const forwardedHost = getHeader(event, 'x-forwarded-host')
  const forwardedProto = getHeader(event, 'x-forwarded-proto')
  if (forwardedHost) {
    const proto = forwardedProto || 'https'
    return `${proto}://${forwardedHost}`.replace(/\/$/, '')
  }

  const host = getHeader(event, 'host')
  if (host) {
    const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
    return `${proto}://${host}`.replace(/\/$/, '')
  }

  const config = useRuntimeConfig()
  const fallback = (config.public.siteUrl as string) || 'http://localhost:3000'
  return fallback.replace(/\/$/, '')
}
