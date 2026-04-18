// Tiny in-process LRU for query embeddings so repeat searches don't re-spend
// Gemini calls. 30-min TTL, 200 entry cap. Keyed by normalized query string.

interface Entry {
  key: string
  value: number[]
  expiresAt: number
}

const MAX_ENTRIES = 200
const TTL_MS = 30 * 60 * 1000

const cache = new Map<string, Entry>()

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function getCachedEmbedding(query: string): number[] | null {
  const key = normalize(query)
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  // Bump to MRU position.
  cache.delete(key)
  cache.set(key, entry)
  return entry.value
}

export function setCachedEmbedding(query: string, value: number[]): void {
  const key = normalize(query)
  if (cache.has(key)) cache.delete(key)
  cache.set(key, { key, value, expiresAt: Date.now() + TTL_MS })
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}
