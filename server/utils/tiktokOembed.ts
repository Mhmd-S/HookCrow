export interface TikTokOembed {
  authorName: string | null
  thumbnailUrl: string | null
  title: string | null
}

const log = createLogger('tiktok-oembed')

/**
 * Fetch TikTok oEmbed data for a given URL.
 * Returns partial metadata on success; returns an empty object on any failure (never throws).
 */
export async function fetchTikTokOembed(url: string): Promise<TikTokOembed> {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      log.warn('oEmbed fetch returned non-OK', { status: res.status, url })
      return { authorName: null, thumbnailUrl: null, title: null }
    }

    const data = await res.json() as Record<string, unknown>
    const authorName = typeof data.author_name === 'string' ? data.author_name : null
    const thumbnailUrl = typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null
    const title = typeof data.title === 'string' ? data.title.slice(0, 500) : null

    log.info('oEmbed fetched', { authorName, hasThumbnail: !!thumbnailUrl, hasTitle: !!title })
    return { authorName, thumbnailUrl, title }
  } catch (err) {
    log.warn('oEmbed fetch failed', err instanceof Error ? err.message : String(err), { url })
    return { authorName: null, thumbnailUrl: null, title: null }
  }
}
