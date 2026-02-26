export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const videoId = validateUUID(body?.videoId, 'videoId')
  const supabase = useServerSupabase()

  // Verify ownership or admin
  const { data: videoRow, error: fetchErr } = await supabase
    .from('videos')
    .select('id, user_id, video_path')
    .eq('id', videoId)
    .single()

  const video = videoRow as any
  if (fetchErr || !video) {
    throw createError({ statusCode: 404, message: 'Video not found' })
  }

  if (video.user_id !== user.id && user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Not authorized' })
  }

  // Step 1: Process video (transcription + structure analysis + segments)
  const processResult = await $fetch<{
    success: boolean
    logicFlowId: string | null
    logicFlowName: string | null
    segmentCount: number
  }>('/api/process-video', {
    method: 'POST',
    body: { videoId }
  })

  if (!processResult.success) {
    throw createError({ statusCode: 500, message: 'Video processing failed' })
  }

  // Step 2: Fetch the processed video to get transcript and segments
  const { data: processedVideoRow } = await supabase
    .from('videos')
    .select('*, segments(*)')
    .eq('id', videoId)
    .order('segment_order', { referencedTable: 'segments' })
    .single()

  const processedVideo = processedVideoRow as any
  if (!processedVideo) {
    throw createError({ statusCode: 500, message: 'Failed to fetch processed video' })
  }

  const segments = processedVideo.segments || []
  const transcript = segments
    .map((s: any) => (s.transcript_raw || '').trim())
    .filter(Boolean)
    .join(' ')

  // Step 3: Run remaining analyses in parallel (non-critical failures are caught)
  const results = await Promise.allSettled([
    // Skeletal logic
    transcript ? $fetch('/api/generate-skeletal-logic', {
      method: 'POST',
      body: {
        transcript,
        segments: segments.map((s: any) => ({
          label: s.label,
          start_time: s.start_time,
          end_time: s.end_time,
          transcript_raw: s.transcript_raw || ''
        })),
        logicFlowType: processResult.logicFlowName || undefined
      }
    }).then(async (skeletalLogic) => {
      await supabase
        .from('videos')
        .update({ skeletal_logic: skeletalLogic } as any)
        .eq('id', videoId)
    }) : Promise.resolve(),

    // Audio analysis
    $fetch('/api/analyze-audio', {
      method: 'POST',
      body: { videoId }
    }),

    // Visual analysis
    $fetch('/api/analyze-visual', {
      method: 'POST',
      body: { videoId }
    }),

    // Semantic tags
    transcript ? $fetch<{ domain: string[]; format: string[]; audience: string[] }>('/api/suggest-semantic-tags', {
      method: 'POST',
      body: { transcript }
    }).then(async (tags) => {
      const allTags = [...(tags.domain || []), ...(tags.format || []), ...(tags.audience || [])]
      if (allTags.length > 0) {
        await supabase
          .from('videos')
          .update({ semantic_tags: allTags } as any)
          .eq('id', videoId)
      }
    }) : Promise.resolve()
  ])

  // Count successes/failures
  const failures = results.filter(r => r.status === 'rejected').length

  return {
    success: true,
    videoId,
    logicFlowName: processResult.logicFlowName,
    segmentCount: processResult.segmentCount,
    analysisFailures: failures
  }
})
