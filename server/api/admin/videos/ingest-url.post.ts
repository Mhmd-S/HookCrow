import type { Json } from '~/types/database'
import { readFile } from 'node:fs/promises'

interface IngestUrlRequest {
  url: string
}

interface IngestUrlResponse {
  data: {
    videoId: string
  }
}

const log = createLogger('ingest-url')

export default defineEventHandler(async (event): Promise<IngestUrlResponse> => {
  const user = await requireAdmin(event)
  const body = await readBody<IngestUrlRequest>(event)

  // Validate URL
  const rawUrl = validateRequired(body?.url, 'url')
  validateString(rawUrl, 'url', { minLength: 5, maxLength: 2000 })

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw createError({ statusCode: 400, message: 'url must be a valid URL' })
  }

  if (!parsedUrl.hostname.endsWith('tiktok.com')) {
    throw createError({ statusCode: 400, message: 'url must be a TikTok URL (tiktok.com)' })
  }

  const url = rawUrl

  // Fetch oEmbed metadata (best-effort)
  const { authorName, thumbnailUrl, title } = await fetchTikTokOembed(url)

  // Insert video row
  const supabase = useServerSupabase()
  const { data: video, error: insertError } = await supabase
    .from('videos')
    .insert({
      platform: 'TikTok',
      source_url: url,
      creator_handle: authorName ?? null,
      thumbnail_url: thumbnailUrl ?? null,
      title: title ?? null,
      video_path: null,
      status: 'draft',
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError || !video) {
    log.error('Failed to insert video row', insertError, { url })
    throw createError({ statusCode: 500, message: 'Failed to create video record' })
  }

  const videoId = video.id
  log.info('Video row created', { videoId, url })

  // Download temp mp4 → analyze → cleanup
  let downloadResult: Awaited<ReturnType<typeof downloadTikTokToTemp>> | null = null

  try {
    downloadResult = await downloadTikTokToTemp(url)
    const videoBuffer = await readFile(downloadResult.path)

    log.info('Downloaded TikTok video to temp', { videoId, sizeMB: (videoBuffer.length / (1024 * 1024)).toFixed(2) })

    const result = await analyzeVideoBuffer({
      ai: useServerGemini(),
      supabase,
      config: useRuntimeConfig(),
      videoId,
      videoBuffer,
      durationSeconds: undefined,
      existingTitle: null,
    })

    log.info('Analysis complete', { videoId, ...result })

    // Mark as complete
    await supabase
      .from('videos')
      .update({ status: 'complete' })
      .eq('id', videoId)

    return { data: { videoId } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed'
    log.error('Ingestion failed', err, { videoId, url })

    // Set visual_analysis to failed state (same shape as process-video failure)
    const failedAt = new Date().toISOString()
    try {
      await supabase
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

    throw createError({ statusCode: 500, message })
  } finally {
    if (downloadResult) {
      await downloadResult.cleanup()
    }
  }
})
