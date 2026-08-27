import { extractThumbnailFromVideo } from '~~/server/utils/audio'

const log = createLogger('ingest-creative-ad')

const MAX_AD_BYTES = 50 * 1024 * 1024 // matches the `videos` bucket's per-file limit
const MIN_AD_BYTES = 100 * 1024
const DOWNLOAD_TIMEOUT_MS = 120_000

/**
 * Ingest one TikTok Creative Center ad.
 *
 * Unlike the organic TikTok path (which embeds and stores no mp4), Creative
 * Center ads have no public post to embed — the only playable artifact is a
 * SIGNED CDN url that expires. So the mp4 and poster are copied into our own
 * storage at ingest time and served from there.
 */
export async function ingestCreativeCenterAd(
  ad: CreativeCenterAd,
  deps: {
    supabase: ReturnType<typeof useServerSupabase>
    ai: ReturnType<typeof useServerGemini>
    config: ReturnType<typeof useRuntimeConfig>
    createdBy?: string | null
    publishGate?: boolean
  },
): Promise<IngestResult> {
  const sourceUrl = creativeCenterAdUrl(ad.adId)

  // DEDUP FIRST — on the canonical url, never the signed one.
  const { data: existing } = await deps.supabase
    .from('videos')
    .select('id')
    .eq('source_url', sourceUrl)
    .maybeSingle()

  if (existing) {
    log.info('Skipped duplicate', { adId: ad.adId, videoId: existing.id })
    return { status: 'skipped', videoId: existing.id }
  }

  // Download the mp4 BEFORE inserting anything: the signed url is the one
  // thing that rots, and a failed download should leave no trace behind.
  let videoBuffer: Buffer
  try {
    videoBuffer = await downloadSignedVideo(ad.videoUrl)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed'
    log.error('Creative Center download failed', err, { adId: ad.adId })
    return { status: 'failed', error: message }
  }

  const supabase = deps.supabase
  const videoPath = `videos/${crypto.randomUUID()}.mp4`

  const { error: uploadErr } = await supabase.storage
    .from('videos')
    .upload(videoPath, videoBuffer, { contentType: 'video/mp4', upsert: false })

  if (uploadErr) {
    log.error('Creative Center upload failed', uploadErr, { adId: ad.adId })
    return { status: 'failed', error: `Storage upload failed: ${uploadErr.message}` }
  }

  // Poster: prefer a frame we extract ourselves (durable), fall back to the
  // signed thumbnail url only as a last resort since it expires too.
  let thumbnailPath: string | null = null
  try {
    const thumb = await extractThumbnailFromVideo(videoBuffer)
    if (thumb) {
      const thumbPath = `thumbnails/${crypto.randomUUID()}.jpg`
      const { error: thumbErr } = await supabase.storage
        .from('videos')
        .upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: false })
      if (!thumbErr) thumbnailPath = thumbPath
    }
  } catch (err) {
    log.warn('Thumbnail extraction failed — falling back to CDN poster', {
      adId: ad.adId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const { data: video, error: insertError } = await supabase
    .from('videos')
    .insert({
      platform: 'TikTok',
      source_url: sourceUrl,
      creator_handle: ad.brandName,
      title: ad.headline,
      video_path: videoPath,
      thumbnail_path: thumbnailPath,
      thumbnail_url: thumbnailPath ? null : ad.thumbnailUrl,
      duration_seconds: ad.videoDuration ? Math.round(ad.videoDuration) : null,
      status: 'draft',
      created_by: deps.createdBy ?? null,
    })
    .select()
    .single()

  if (insertError || !video) {
    log.error('Failed to insert video row', insertError, { adId: ad.adId })
    await supabase.storage.from('videos').remove([videoPath, ...(thumbnailPath ? [thumbnailPath] : [])])
    return { status: 'failed', error: 'Failed to create video record' }
  }

  const videoId = video.id
  log.info('Creative Center ad row created', { videoId, adId: ad.adId, ctr: ad.ctr })

  try {
    await analyzeVideoBuffer({
      ai: deps.ai,
      supabase,
      config: deps.config,
      videoId,
      videoBuffer,
      durationSeconds: ad.videoDuration != null ? Math.round(ad.videoDuration) : undefined,
      existingTitle: ad.headline ?? null,
    })

    const patch: Record<string, unknown> = { status: 'complete' }
    if (deps.publishGate) {
      const { data: analyzed } = await supabase
        .from('videos')
        .select('visual_analysis, semantic_tags')
        .eq('id', videoId)
        .single()
      const lofi = isLoFiVideo(analyzed)
      patch.is_published = lofi
      log.info('Lo-fi gate', { videoId, lofi })
    }

    await supabase.from('videos').update(patch).eq('id', videoId)

    log.info('Creative Center ingestion complete', { videoId, adId: ad.adId })
    return { status: 'ingested', videoId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed'
    log.error('Creative Center ingestion failed', err, { videoId, adId: ad.adId })

    // Roll back row AND stored objects so the ad is retryable and we aren't
    // paying to store an unanalyzed file.
    try {
      await supabase.from('videos').delete().eq('id', videoId)
      await supabase.storage.from('videos').remove([videoPath, ...(thumbnailPath ? [thumbnailPath] : [])])
    } catch (cleanupErr) {
      log.error('Failed to roll back Creative Center ingest', cleanupErr, { videoId })
    }

    return { status: 'failed', videoId, error: message }
  }
}

async function downloadSignedVideo(url: string): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36' },
    })

    if (!res.ok) {
      throw new Error(`Video download HTTP ${res.status} (signed url may have expired)`)
    }

    const buffer = Buffer.from(await res.arrayBuffer())

    if (buffer.length < MIN_AD_BYTES) {
      throw new Error(`Download too small (${(buffer.length / 1024).toFixed(0)}KB) — not a video`)
    }
    if (buffer.length > MAX_AD_BYTES) {
      throw new Error(`Download too large (${(buffer.length / 1024 / 1024).toFixed(0)}MB)`)
    }

    return buffer
  } finally {
    clearTimeout(timer)
  }
}
