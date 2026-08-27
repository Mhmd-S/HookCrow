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

// ── TikTok Creative Center ────────────────────────────────────────────────
// Actor verified cookie-free 2026-08-27. Unlike the organic scraper this
// returns ADS ranked by real performance (CTR/likes), which is the whole
// point: presence here is proof the brand is actively spending.
const CC_ACTOR_URL = 'https://api.apify.com/v2/acts/parseforge~tiktok-creative-center-top-ads-scraper/run-sync-get-dataset-items'

export interface CreativeCenterAd {
  adId: string
  /** Signed CDN url — EXPIRES, download immediately. */
  videoUrl: string
  thumbnailUrl: string | null
  headline: string | null
  brandName: string | null
  ctr: number | null
  likes: number | null
  videoDuration: number | null
  industryCode: string | null
  objectiveKey: string | null
}

/** Canonical, stable url used for dedup — the signed videoUrl is not. */
export function creativeCenterAdUrl(adId: string): string {
  return `https://ads.tiktok.com/business/creativecenter/topads/${adId}`
}

export async function discoverCreativeCenterAds(
  source: { value: string },
  limit: number,
  apifyToken: string,
): Promise<CreativeCenterAd[]> {
  if (!apifyToken) {
    throw new Error('Apify token not configured')
  }

  // `value` is an optional keyword; empty means "top ads overall".
  const keyword = source.value.trim()
  const input: Record<string, unknown> = {
    maxItems: limit,
    countryCode: 'US',
    period: 30,
    sortBy: 'ctr',
    includeDetails: true,
  }
  if (keyword) input.keyword = keyword

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${CC_ACTOR_URL}?token=${encodeURIComponent(apifyToken)}`, {
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
    log.warn('Creative Center response is not an array', { responseType: typeof items })
    return []
  }

  const ads = items
    .filter((item: any) => typeof item?.adId === 'string' && typeof item?.videoUrl === 'string' && item.videoUrl)
    .map((item: any): CreativeCenterAd => ({
      adId: String(item.adId),
      videoUrl: item.videoUrl,
      thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
      headline: typeof item.headline === 'string' ? item.headline : null,
      brandName: typeof item.brandName === 'string' ? item.brandName : null,
      ctr: typeof item.ctr === 'number' ? item.ctr : null,
      likes: typeof item.likes === 'number' ? item.likes : null,
      videoDuration: typeof item.videoDuration === 'number' ? item.videoDuration : null,
      industryCode: typeof item.industryCode === 'string' ? item.industryCode : null,
      objectiveKey: typeof item.objectiveKey === 'string' ? item.objectiveKey : null,
    }))

  // Same ad can appear across pages; keep first occurrence.
  const seen = new Set<string>()
  const unique = ads.filter((a) => (seen.has(a.adId) ? false : (seen.add(a.adId), true)))

  log.info(`Discovered ${unique.length} Creative Center ads (from ${items.length} items)`, {
    keyword: keyword || '(top ads)',
  })

  return unique
}
