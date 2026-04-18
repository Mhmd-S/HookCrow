import type { H3Event } from 'h3'

// In-memory sliding-window rate limiter. Fine for a single-node Nitro deploy;
// if we ever scale horizontally this needs to move to a shared store (Redis).
// Keyed by a caller-supplied bucket + IP so different endpoints can hold
// independent quotas.

interface Bucket {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()

function getClientIp(event: H3Event): string {
  const forwarded = getHeader(event, 'x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  const real = getHeader(event, 'x-real-ip')
  if (real) return real.trim()
  return event.node.req.socket?.remoteAddress || 'unknown'
}

export interface RateLimitOptions {
  bucket: string
  limit: number
  windowMs: number
}

export function checkRateLimit(event: H3Event, opts: RateLimitOptions): void {
  const ip = getClientIp(event)
  const key = `${opts.bucket}:${ip}`
  const now = Date.now()
  const cutoff = now - opts.windowMs

  const entry = buckets.get(key) ?? { timestamps: [] }
  entry.timestamps = entry.timestamps.filter(t => t > cutoff)

  if (entry.timestamps.length >= opts.limit) {
    const oldest = entry.timestamps[0]!
    const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000))
    setResponseHeader(event, 'Retry-After', retryAfterSec)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: 'Too many requests — please try again shortly.'
    })
  }

  entry.timestamps.push(now)
  buckets.set(key, entry)
}
