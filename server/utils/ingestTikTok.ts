import type { Json } from '~/types/database'
import { extractThumbnailFromVideo } from '~~/server/utils/audio'
import type { StoredTikTokVideo } from '~~/server/utils/tiktokStore'

const log = createLogger('ingest-tiktok')

export interface IngestResult {
  status: 'ingested' | 'skipped' | 'failed'
  videoId?: string
  error?: string
}

// Lo-fi / UGC signals from the app taxonomy (app/types/index.ts production_style + VISUAL_TAGS).
const LOFI_STYLES = new Set<string>([
  'Lo-fi/Selfie',
  'UGC/Creator-shot',
  'Talking Head',
  'Screen Recording',
  'Vlog Style',
  'UGC Style',
])

// A discovered video is "lo-fi" if the AI rated it low/medium production quality,
// OR it carries a lo-fi/UGC style tag. Used by both ingest paths when publishGate
// is on (discovery).
export function isLoFiVideo(row: { visual_analysis: Json | null; semantic_tags: string[] | null } | null): boolean {
  if (!row) return false
  const pq = (row.visual_analysis as { overview?: { production_quality?: string } } | null)?.overview?.production_quality
  if (pq === 'low' || pq === 'medium') return true
  return (row.semantic_tags ?? []).some((t) => LOFI_STYLES.has(t))
}

export async function ingestTikTokUrl(
  url: string,
  deps: {
    supabase: ReturnType<typeof useServerSupabase>
    ai: ReturnType<typeof useServerGemini>
    config: ReturnType<typeof useRuntimeConfig>
    createdBy?: string | null
    // When true (discovery), auto-publish only if the analysis says it's lo-fi/UGC;
    // otherwise leave is_published=false (unpublished draft for review).
    publishGate?: boolean
  },
): Promise<IngestResult> {
  // DEDUP FIRST
  const { data: existing } = await deps.supabase
    .from('videos')
    .select('id')
    .eq('source_url', url)
    .maybeSingle()

  if (existing) {
    log.info('Skipped duplicate', { url, videoId: existing.id })
    return { status: 'skipped', videoId: existing.id }
  }

  // Fetch oEmbed metadata (best-effort)
  const { authorName, thumbnailUrl, title } = await fetchTikTokOembed(url)

  // Insert video row
  const { data: video, error: insertError } = await deps.supabase
    .from('videos')
    .insert({
      platform: 'TikTok',
      source_url: url,
      creator_handle: authorName ?? null,
      thumbnail_url: thumbnailUrl ?? null,
      title: title ?? null,
      video_path: null, // set once the mp4 is stored (below)
      status: 'draft',
      created_by: deps.createdBy ?? null,
    })
    .select()
    .single()

  if (insertError || !video) {
    log.error('Failed to insert video row', insertError, { url })
    return { status: 'failed', error: 'Failed to create video record' }
  }

  const videoId = video.id
  log.info('Video row created', { videoId, url })

  // Download mp4 → store in `videos` bucket → analyze. The stored copy is what
  // our player serves; the size check (stub / bucket limit) happens in the util.
  let stored: StoredTikTokVideo | null = null

  try {
    stored = await downloadAndStoreTikTok(url, deps.supabase)
    const videoBuffer = stored.buffer

    // Poster: TikTok's oEmbed thumbnail_url is a signed CDN link that 403s after
    // ~30 days, so it cannot be the durable poster. We already hold the mp4 here
    // for analysis — extract a frame and store it, same as the Creative Center path.
    let thumbnailPath: string | null = null
    try {
      const thumb = await extractThumbnailFromVideo(videoBuffer)
      if (thumb) {
        const thumbPath = `thumbnails/${crypto.randomUUID()}.jpg`
        const { error: thumbErr } = await deps.supabase.storage
          .from('videos')
          .upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: false })
        if (!thumbErr) thumbnailPath = thumbPath
        else log.warn('Thumbnail upload failed — keeping CDN poster', { videoId, error: thumbErr.message })
      }
    } catch (err) {
      log.warn('Thumbnail extraction failed — keeping CDN poster', {
        videoId,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    await analyzeVideoBuffer({
      ai: deps.ai,
      supabase: deps.supabase,
      config: deps.config,
      videoId,
      videoBuffer,
      durationSeconds: stored.durationSeconds ?? undefined,
      existingTitle: null,
    })

    // Lo-fi publish gate (discovery only): read the analysis result and decide is_published.
    const patch: Record<string, unknown> = { status: 'complete', video_path: stored.videoPath }
    if (thumbnailPath) {
      // Drop the expiring CDN url once we have a durable frame of our own.
      patch.thumbnail_path = thumbnailPath
      patch.thumbnail_url = null
    }
    if (deps.publishGate) {
      const { data: analyzed } = await deps.supabase
        .from('videos')
        .select('visual_analysis, semantic_tags')
        .eq('id', videoId)
        .single()
      const lofi = isLoFiVideo(analyzed)
      patch.is_published = lofi
      log.info('Lo-fi gate', { videoId, lofi })
    }

    // Checked: if this fails the row has no video_path and the stored mp4 is
    // orphaned, so treat it as a failed ingest and roll both back.
    const { error: patchErr } = await deps.supabase.from('videos').update(patch).eq('id', videoId)
    if (patchErr) throw new Error(`Failed to finalize video row: ${patchErr.message}`)

    log.info('Ingestion complete', { videoId })
    return { status: 'ingested', videoId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed'
    log.error('Ingestion failed', err, { videoId, url })

    // Remove the row: a failed ingest has no analysis worth keeping, and a
    // lingering draft would dedup-block this URL from ever being retried.
    try {
      await deps.supabase.from('videos').delete().eq('id', videoId)
      log.info('Rolled back video row after failed ingest', { videoId, url })
    } catch (deleteErr) {
      log.error('Failed to roll back video row', deleteErr, { videoId })
    }

    // Don't pay to store an mp4 that no row points at.
    if (stored) await stored.remove()

    return { status: 'failed', videoId, error: message }
  }
}
