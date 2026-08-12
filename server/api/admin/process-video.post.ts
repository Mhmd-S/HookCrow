interface ProcessRequest {
  videoId: string
}

interface ProcessResponse {
  success: boolean
  logicFlowId: string | null
  logicFlowName: string | null
  segmentCount: number
}

const log = createLogger('process-video')

export default defineEventHandler(async (event): Promise<ProcessResponse> => {
  await requireAdmin(event)

  const body = await readBody<ProcessRequest>(event)
  const videoId = validateUUID(body?.videoId, 'videoId')

  const pipeline = log.timedOp('full pipeline', { videoId })

  const supabase = useServerSupabase()
  const config = useRuntimeConfig()

  // Fetch video record
  log.info('Fetching video record', { videoId })
  const { data: video, error: videoError } = await supabase
    .from('videos')
    .select('id, video_path, duration_seconds, title')
    .eq('id', videoId)
    .single()

  if (videoError || !video) {
    log.error('Video not found', videoError, { videoId })
    throw createError({ statusCode: 404, message: 'Video not found' })
  }

  if (!video.video_path) {
    log.error('Video has no stored file path — cannot process via storage pipeline', {}, { videoId })
    throw createError({ statusCode: 400, message: 'Video has no stored file; use the ingest-url endpoint for TikTok embeds' })
  }

  log.info('Video record loaded', { videoId, videoPath: video.video_path, durationSeconds: video.duration_seconds })

  const supabaseUrl = config.public.supabaseUrl as string
  const videoUrl = `${supabaseUrl}/storage/v1/object/public/videos/${video.video_path}`

  const fetchOp = log.timedOp('fetch video from storage', { videoId })
  const videoResponse = await fetch(videoUrl)
  if (!videoResponse.ok) {
    fetchOp.fail(new Error(`HTTP ${videoResponse.status}`))
    throw createError({ statusCode: 500, message: 'Failed to fetch video from storage' })
  }

  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
  const bufferSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2)
  fetchOp.done({ sizeMB: bufferSizeMB })

  const result = await analyzeVideoBuffer({
    ai: useServerGemini(),
    supabase,
    config,
    videoId,
    videoBuffer,
    durationSeconds: video.duration_seconds ?? undefined,
    existingTitle: video.title,
  })

  pipeline.done({
    ...result,
  })

  return {
    success: true,
    ...result,
  }
})
