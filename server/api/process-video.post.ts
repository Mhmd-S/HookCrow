interface ProcessRequest {
  videoId: string
}

interface ProcessingStep {
  step: 'transcribing' | 'analyzing' | 'saving' | 'complete'
  progress: number
  message: string
}

interface ProcessResponse {
  success: boolean
  logicFlowId: string | null
  logicFlowName: string | null
  segmentCount: number
}

export default defineEventHandler(async (event): Promise<ProcessResponse> => {
  const config = useRuntimeConfig()
  const body = await readBody<ProcessRequest>(event)

  const videoId = validateUUID(body?.videoId, 'videoId')

  const supabase = useServerSupabase()

  // Fetch video record
  const { data: video, error: videoError } = await supabase
    .from('videos')
    .select('id, video_path, duration_seconds')
    .eq('id', videoId)
    .single()

  if (videoError || !video) {
    throw createError({
      statusCode: 404,
      message: 'Video not found'
    })
  }

  // Get video URL from storage
  const supabaseUrl = config.public.supabaseUrl as string
  const videoUrl = `${supabaseUrl}/storage/v1/object/public/videos/${video.video_path}`

  // Step 1: Fetch video and transcribe
  let transcriptData: {
    text: string
    segments: Array<{ start: number; end: number; text: string }>
  }

  try {
    // Fetch video file
    const videoResponse = await fetch(videoUrl)
    if (!videoResponse.ok) {
      throw new Error('Failed to fetch video from storage')
    }

    const videoBlob = await videoResponse.blob()

    // Check file size (25MB limit for Whisper)
    const maxSize = 25 * 1024 * 1024
    if (videoBlob.size > maxSize) {
      throw createError({
        statusCode: 400,
        message: 'Video file too large for transcription (max 25MB)'
      })
    }

    // Create FormData for transcription
    const formData = new FormData()
    const file = new File([videoBlob], 'video.mp4', { type: 'video/mp4' })
    formData.append('file', file)

    // Call transcribe endpoint internally via OpenAI directly
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({
      apiKey: config.openaiApiKey as string
    })

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    })

    transcriptData = {
      text: transcription.text,
      segments: transcription.segments?.map(seg => ({
        start: seg.start,
        end: seg.end,
        text: seg.text
      })) || []
    }
  } catch (err) {
    console.error('Transcription error:', err)
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Transcription failed'
    })
  }

  if (!transcriptData.text || transcriptData.segments.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No speech detected in video'
    })
  }

  // Calculate video duration from segments
  const videoDuration = video.duration_seconds ||
    Math.ceil(transcriptData.segments[transcriptData.segments.length - 1]?.end || 30)

  // Step 2: Analyze transcript
  let analysisResult: {
    logicFlowId: string | null
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

  try {
    // Import and call analyze function directly for efficiency
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({
      apiKey: config.openaiApiKey as string
    })

    // Fetch existing logic flows
    const { data: logicFlows } = await supabase
      .from('logic_flows')
      .select('id, name, description')

    const logicFlowsContext = logicFlows?.map(lf => `- ${lf.name}: ${lf.description}`).join('\n') || ''

    const systemPrompt = `You are a video content analyst specializing in short-form video structure analysis.
Your job is to analyze video transcripts and identify the skeletal structure (logic flow) being used.

Available logic flow patterns:
${logicFlowsContext}

Segment labels to use: Hook, Bridge, Value, Proof, CTA

Guidelines:
- Hook: The opening that grabs attention (usually first 0-5 seconds)
- Bridge: The transition that builds context or agitates the problem
- Value: The main content, solution, or information being delivered
- Proof: Evidence, results, or social proof
- CTA: Call to action at the end

When creating script blueprints, replace specific details with [PLACEHOLDERS] in CAPS, like:
- [PRODUCT] for product names
- [PAIN POINT] for problems
- [NUMBER] for statistics
- [RESULT] for outcomes
- [TOPIC] for subject matter

Return your analysis as valid JSON.`

    const userPrompt = `Analyze this video transcript and identify the structure:

Full transcript:
"${transcriptData.text}"

Timestamped segments:
${transcriptData.segments.map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: "${s.text}"`).join('\n')}

Video duration: ${videoDuration} seconds

Return a JSON object with this exact structure:
{
  "logicFlowName": "Name of the detected pattern (must match one from the list above)",
  "confidence": 0.0 to 1.0 confidence score,
  "segments": [
    {
      "label": "Hook|Bridge|Value|Proof|CTA",
      "start_time": start in seconds,
      "end_time": end in seconds,
      "transcript_raw": "exact transcript text for this segment",
      "script_blueprint": "template version with [PLACEHOLDERS]"
    }
  ]
}

Group the timestamped segments logically into the appropriate labels (Hook, Bridge, Value, Proof, CTA).
Not all labels are required - use only what fits the content.
Ensure segments cover the full video duration without overlapping.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI')
    }

    const analysis = JSON.parse(content) as {
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

    // Match logic flow to database
    let logicFlowId: string | null = null
    if (logicFlows && analysis.logicFlowName) {
      const match = logicFlows.find(lf =>
        lf.name.toLowerCase().includes(analysis.logicFlowName.toLowerCase()) ||
        analysis.logicFlowName.toLowerCase().includes(lf.name.toLowerCase().split(' ')[0])
      )
      if (match) {
        logicFlowId = match.id
      }
    }

    const validLabels = ['Hook', 'Bridge', 'Value', 'Proof', 'CTA']
    analysisResult = {
      logicFlowId,
      logicFlowName: analysis.logicFlowName,
      confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
      segments: analysis.segments
        .filter(seg => validLabels.includes(seg.label))
        .map(seg => ({
          label: seg.label,
          start_time: Math.max(0, seg.start_time),
          end_time: Math.min(videoDuration, seg.end_time),
          transcript_raw: seg.transcript_raw || '',
          script_blueprint: seg.script_blueprint || ''
        }))
    }
  } catch (err) {
    console.error('Analysis error:', err)
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Analysis failed'
    })
  }

  // Step 3: Update video record
  const { error: updateError } = await supabase
    .from('videos')
    .update({
      logic_flow_id: analysisResult.logicFlowId,
      script_raw: transcriptData.text,
      duration_seconds: videoDuration
    })
    .eq('id', videoId)

  if (updateError) {
    console.error('Video update error:', updateError)
    throw createError({
      statusCode: 500,
      message: 'Failed to update video record'
    })
  }

  // Step 4: Delete existing segments and insert new ones
  const { error: deleteError } = await supabase
    .from('segments')
    .delete()
    .eq('video_id', videoId)

  if (deleteError) {
    console.error('Segment delete error:', deleteError)
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
      console.error('Segment insert error:', insertError)
      throw createError({
        statusCode: 500,
        message: 'Failed to save segments'
      })
    }
  }

  return {
    success: true,
    logicFlowId: analysisResult.logicFlowId,
    logicFlowName: analysisResult.logicFlowName,
    segmentCount: analysisResult.segments.length
  }
})
