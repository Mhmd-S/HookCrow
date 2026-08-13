import type { Json } from '~/types/database'
import { readFile } from 'node:fs/promises'

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
// OR it carries a lo-fi/UGC style tag. Used only when publishGate is on (discovery).
function isLoFiVideo(row: { visual_analysis: Json | null; semantic_tags: string[] | null } | null): boolean {
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
      video_path: null,
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

  // Download temp mp4 → analyze → cleanup
  let downloadResult: Awaited<ReturnType<typeof downloadTikTokToTemp>> | null = null

  try {
    downloadResult = await downloadTikTokToTemp(url)
    const videoBuffer = await readFile(downloadResult.path)

    log.info('Downloaded TikTok video to temp', { videoId, sizeMB: (videoBuffer.length / (1024 * 1024)).toFixed(2) })

    await analyzeVideoBuffer({
      ai: deps.ai,
      supabase: deps.supabase,
      config: deps.config,
      videoId,
      videoBuffer,
      durationSeconds: undefined,
      existingTitle: null,
    })

    // Lo-fi publish gate (discovery only): read the analysis result and decide is_published.
    const patch: Record<string, unknown> = { status: 'complete' }
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

    await deps.supabase.from('videos').update(patch).eq('id', videoId)

    log.info('Ingestion complete', { videoId })
    return { status: 'ingested', videoId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed'
    log.error('Ingestion failed', err, { videoId, url })

    // Set visual_analysis to failed state
    const failedAt = new Date().toISOString()
    try {
      await deps.supabase
        .from('videos')
        .update({
          visual_analysis: {
            status: 'failed',
            analyzed_at: failedAt,
            error: message,
            overview: null,
            segments: null,
          } as unknown as Json,
        })
        .eq('id', videoId)
    } catch (updateErr) {
      log.error('Failed to update visual_analysis state', updateErr, { videoId })
    }

    return { status: 'failed', videoId, error: message }
  } finally {
    if (downloadResult) {
      await downloadResult.cleanup()
    }
  }
}
