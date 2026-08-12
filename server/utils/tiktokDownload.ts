import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const log = createLogger('tiktok-dl')

export interface DownloadResult {
  path: string
  cleanup: () => Promise<void>
}

// Managed resolver. Its servers fetch TikTok (residential IPs), so this works
// from a datacenter/cloud host where a direct yt-dlp page-scrape is bot-blocked.
// It returns a direct CDN mp4 URL that is publicly fetchable.
// Swap this base + parse shape for a paid API (e.g. Apify) if reliability demands it.
const RESOLVER_API = 'https://www.tikwm.com/api/'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

interface ResolverResponse {
  code?: number
  msg?: string
  data?: { play?: string; hdplay?: string }
}

/**
 * Resolve a TikTok URL to a direct mp4 via a managed API, then download that
 * mp4 to a unique temp dir. Returns the file path + a cleanup() that removes it.
 */
export async function downloadTikTokToTemp(url: string): Promise<DownloadResult> {
  // 1. Resolve a direct mp4 URL (server-side fetch — IP-agnostic).
  const apiUrl = `${RESOLVER_API}?hd=1&url=${encodeURIComponent(url)}`
  const apiRes = await fetch(apiUrl, { headers: { 'User-Agent': UA } })
  if (!apiRes.ok) {
    throw new Error(`TikTok resolver HTTP ${apiRes.status}`)
  }
  const body = (await apiRes.json()) as ResolverResponse
  if (body.code !== 0 || !body.data) {
    throw new Error(`TikTok resolver error: ${body.msg || 'no data returned'}`)
  }
  const mp4Url = body.data.hdplay || body.data.play
  if (!mp4Url) {
    throw new Error('TikTok resolver returned no downloadable video URL')
  }

  // 2. Download the mp4 to a temp file.
  const dir = await mkdtemp(join(tmpdir(), 'tiktok-dl-'))
  const path = join(dir, 'video.mp4')
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true })
  }

  try {
    const videoRes = await fetch(mp4Url, {
      headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' },
    })
    if (!videoRes.ok) {
      throw new Error(`Video download HTTP ${videoRes.status}`)
    }
    const buffer = Buffer.from(await videoRes.arrayBuffer())
    await writeFile(path, buffer)
    log.info('Downloaded TikTok video', { url, sizeMB: (buffer.length / (1024 * 1024)).toFixed(2) })
    return { path, cleanup }
  } catch (err) {
    await cleanup()
    throw err
  }
}
