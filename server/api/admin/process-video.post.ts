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

  const ai = useServerGemini()
  const config = useRuntimeConfig()
  const body = await readBody<ProcessRequest>(event)

  const videoId = validateUUID(body?.videoId, 'videoId')
  const pipeline = log.timedOp('full pipeline', { videoId })

  const supabase = useServerSupabase()

  // Fetch video record
  log.info('Fetching video record', { videoId })
  const { data: video, error: videoError } = await supabase
    .from('videos')
    .select('id, video_path, duration_seconds, title')
    .eq('id', videoId)
    .single()

  if (videoError || !video) {
    log.error('Video not found', videoError, { videoId })
    throw createError({
      statusCode: 404,
      message: 'Video not found'
    })
  }

  log.info('Video record loaded', { videoId, videoPath: video.video_path, durationSeconds: video.duration_seconds })

  // Get video URL from storage
  const supabaseUrl = config.public.supabaseUrl as string
  const videoUrl = `${supabaseUrl}/storage/v1/object/public/videos/${video.video_path}`

  // Fetch video file
  const fetchOp = log.timedOp('fetch video from storage', { videoId })
  const videoResponse = await fetch(videoUrl)
  if (!videoResponse.ok) {
    fetchOp.fail(new Error(`HTTP ${videoResponse.status}`))
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch video from storage'
    })
  }

  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
  const bufferSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2)
  fetchOp.done({ sizeMB: bufferSizeMB })

  // Fetch existing logic flows for context
  const { data: logicFlows } = await supabase
    .from('logic_flows')
    .select('id, name, description')

  log.info('Logic flows loaded', { count: logicFlows?.length || 0 })

  const logicFlowsContext = logicFlows?.map(lf => `- ${lf.name}: ${lf.description}`).join('\n') || ''

  // Extract real duration from video file using ffprobe
  let videoDuration = video.duration_seconds || 0
  if (!videoDuration) {
    try {
      videoDuration = Math.round(await getVideoDuration(videoBuffer))
      log.info('Video duration extracted via ffprobe', { videoId, durationSeconds: videoDuration })
    } catch {
      videoDuration = 30 // fallback
      log.warn('Could not extract video duration, using fallback', { videoId, fallback: videoDuration })
    }
  }

  // Upload video to Gemini Files API
  let uploadedFile: { uri: string; mimeType: string; name: string }
  try {
    uploadedFile = await uploadVideoToGemini(ai, videoBuffer)
  } catch (err) {
    log.error('Video upload to Gemini failed', err, { videoId })
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Failed to upload video for processing'
    })
  }

  // Single combined call: transcribe + analyze structure
  const prompt = `Analyze this short-form video. Perform three tasks:

1. TITLE: Write a concise title (max 80 chars, no quotes, no trailing punctuation) for this short-form marketing video. Capture the specific angle, hook, or product claim the creator is using — not a generic description of the video. Examples of the style we want: "The $0 Cold DM That Booked 12 Calls", "Why Your Landing Page Hook Loses in 3 Seconds", "POV: Launching a SaaS With Zero Audience". Avoid filler like "Video about…", "This video shows…", or emoji.
2. TRANSCRIBE: Transcribe all spoken words with timestamps.
3. ANALYZE STRUCTURE: Identify the video's content structure pattern.

Available logic flow patterns:
${logicFlowsContext}

Segment labels: Hook, Bridge, Value, Proof, CTA
- Hook: The opening that grabs attention (usually first 0-5 seconds)
- Bridge: The transition that builds context or agitates the problem
- Value: The main content, solution, or information being delivered
- Proof: Evidence, results, or social proof
- CTA: Call to action at the end

When creating script_blueprint, replace specifics with [PLACEHOLDERS]: [PRODUCT], [PAIN POINT], [NUMBER], [RESULT], [TOPIC]

Video duration: ${videoDuration} seconds

Return a JSON object with this exact structure:
{
  "title": "concise specific title (max 80 chars)",
  "transcript": "full transcript text",
  "logicFlowName": "detected pattern name from the list above",
  "confidence": 0.0 to 1.0,
  "segments": [
    {
      "label": "Hook|Bridge|Value|Proof|CTA",
      "start_time": start in seconds,
      "end_time": end in seconds,
      "transcript_raw": "exact transcript for this segment",
      "script_blueprint": "template with [PLACEHOLDERS]"
    }
  ]
}

Group content logically into segments. Not all labels are required - use only what fits.
Ensure segments cover the full video duration without overlapping.
If no speech is detected, still analyze the visual structure and return segments with empty transcript_raw.`

  let analysisResult: {
    title: string | null
    logicFlowId: string | null
    logicFlowName: string
    confidence: number
    transcript: string
    segments: Array<{
      label: string
      start_time: number
      end_time: number
      transcript_raw: string
      script_blueprint: string
    }>
  }

  const geminiOp = log.timedOp('Gemini transcribe + analyze', { videoId, model: 'gemini-2.5-flash' })
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        role: 'user',
        parts: [
          { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
          { text: prompt }
        ]
      },
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      }
    })

    const content = response.text
    if (!content) {
      throw new Error('No response from AI')
    }

    log.info('Gemini response received', { videoId, responseLength: content.length })

    const analysis = JSON.parse(content) as {
      title?: string
      transcript: string
      logicFlowName: string
      confidence: number
      segments: Array<{
        label: string
        start_time: number
        end_time: number
        transcript_raw: string
        script_blueprint: string
      }>
    }

    const cleanedTitle = analysis.title
      ? sanitizeString(String(analysis.title)).replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim().slice(0, 200) || null
      : null

    // Match logic flow to database
    let logicFlowId: string | null = null
    if (logicFlows && analysis.logicFlowName) {
      const match = logicFlows.find(lf =>
        lf.name.toLowerCase().includes(analysis.logicFlowName.toLowerCase()) ||
        analysis.logicFlowName.toLowerCase().includes(lf.name.toLowerCase().split(' ')[0])
      )
      if (match) {
        logicFlowId = match.id
        log.info('Logic flow matched', { detected: analysis.logicFlowName, matched: match.name, logicFlowId })
      } else {
        log.warn('Logic flow not matched', { detected: analysis.logicFlowName })
      }
    }

    const validLabels = ['Hook', 'Bridge', 'Value', 'Proof', 'CTA']
    const actualDuration = videoDuration
    const rawSegmentCount = analysis.segments?.length || 0

    // Detect if Gemini returned times in milliseconds instead of seconds
    // If the max segment end_time is more than 2x the actual duration, assume milliseconds
    const maxEndTime = Math.max(...(analysis.segments || []).map(s => s.end_time || 0), 0)
    const timesInMs = actualDuration > 0 && maxEndTime > actualDuration * 2
    if (timesInMs) {
      log.warn('Detected timestamps in milliseconds, converting to seconds', { videoId, maxEndTime, actualDuration })
    }

    analysisResult = {
      title: cleanedTitle,
      logicFlowId,
      logicFlowName: analysis.logicFlowName,
      confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
      transcript: analysis.transcript || '',
      segments: (analysis.segments || [])
        .filter(seg => validLabels.includes(seg.label))
        .map(seg => {
          const startRaw = timesInMs ? seg.start_time / 1000 : seg.start_time
          const endRaw = timesInMs ? seg.end_time / 1000 : seg.end_time
          return {
            label: seg.label,
            start_time: Math.max(0, startRaw),
            end_time: Math.min(actualDuration, Math.max(startRaw + 0.1, endRaw)),
            transcript_raw: seg.transcript_raw || '',
            script_blueprint: seg.script_blueprint || ''
          }
        })
        .filter(seg => seg.end_time > seg.start_time)
    }

    const filteredOut = rawSegmentCount - analysisResult.segments.length
    geminiOp.done({
      logicFlowName: analysis.logicFlowName,
      confidence: analysisResult.confidence,
      transcriptLength: analysisResult.transcript.length,
      rawSegments: rawSegmentCount,
      validSegments: analysisResult.segments.length,
      filteredOut,
      segmentLabels: analysisResult.segments.map(s => s.label).join(', ')
    })
  } catch (err) {
    geminiOp.fail(err)
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Analysis failed'
    })
  }

  // Update video record. Only fill title if the admin hasn't set one.
  const shouldSetTitle = !video.title && !!analysisResult.title
  log.info('Updating video record', {
    videoId,
    logicFlowId: analysisResult.logicFlowId,
    settingTitle: shouldSetTitle
  })
  const videoUpdate: Record<string, unknown> = {
    logic_flow_id: analysisResult.logicFlowId,
    script_raw: analysisResult.transcript,
    duration_seconds: videoDuration
  }
  if (shouldSetTitle) videoUpdate.title = analysisResult.title

  const { error: updateError } = await supabase
    .from('videos')
    .update(videoUpdate)
    .eq('id', videoId)

  if (updateError) {
    log.error('Failed to update video record', updateError, { videoId })
    throw createError({
      statusCode: 500,
      message: 'Failed to update video record'
    })
  }

  // Delete existing segments and insert new ones
  log.info('Replacing segments', { videoId, newSegmentCount: analysisResult.segments.length })
  const { error: deleteError } = await supabase
    .from('segments')
    .delete()
    .eq('video_id', videoId)

  if (deleteError) {
    log.error('Failed to delete existing segments', deleteError, { videoId })
  }

  if (analysisResult.segments.length > 0) {
    const segmentInserts = analysisResult.segments.map((seg, index) => ({
      video_id: videoId,
      segment_order: index,
      label: seg.label,
      start_time: seg.start_time,
      end_time: seg.end_time,
      transcript_raw: seg.transcript_raw,
      script_blueprint: seg.script_blueprint
    }))

    const { error: insertError } = await supabase
      .from('segments')
      .insert(segmentInserts)

    if (insertError) {
      log.error('Failed to insert segments', insertError, { videoId, segmentCount: segmentInserts.length })
      throw createError({
        statusCode: 500,
        message: 'Failed to save segments'
      })
    }
  }

  pipeline.done({
    logicFlowName: analysisResult.logicFlowName,
    segmentCount: analysisResult.segments.length,
    transcriptLength: analysisResult.transcript.length
  })

  return {
    success: true,
    logicFlowId: analysisResult.logicFlowId,
    logicFlowName: analysisResult.logicFlowName,
    segmentCount: analysisResult.segments.length
  }
})
