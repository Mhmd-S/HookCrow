const log = createLogger('apify')

const ACTOR_URL = 'https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items'
const TIMEOUT_MS = 180_000

export async function discoverTikTokUrls(
  source: { type: 'hashtag' | 'profile' | 'search'; value: string },
  limit: number,
  apifyToken: string,
): Promise<string[]> {
  if (!apifyToken) {
    throw new Error('Apify token not configured')
  }

  let input: Record<string, unknown> = { resultsPerPage: limit, shouldDownloadVideos: false }

  if (source.type === 'hashtag') {
    input.hashtags = [source.value.replace(/^#/, '')]
  } else if (source.type === 'profile') {
    input.profiles = [source.value.replace(/^@/, '')]
  } else {
    input.searchQueries = [source.value]
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${ACTOR_URL}?token=${encodeURIComponent(apifyToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timer)
    const name = (err as any)?.name
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new Error('Apify request timed out')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new Error(`Apify HTTP ${res.status}`)
  }

  const items: unknown[] = await res.json()
  if (!Array.isArray(items)) {
    log.warn('Apify response is not an array', { responseType: typeof items })
    return []
  }

  const urls = items
    .map((item: any) => (typeof item?.webVideoUrl === 'string' ? item.webVideoUrl : null))
    .filter((u): u is string => u !== null && u.includes('/video/'))

  const unique = [...new Set(urls)]

  log.info(`Discovered ${unique.length} unique URLs (from ${items.length} items)`, {
    type: source.type,
    value: source.value,
  })

  return unique
}
