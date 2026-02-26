interface ProcessRequest {
  videoId: string
}

interface ProcessResponse {
  success: boolean
  logicFlowId: string | null
  logicFlowName: string | null
  segmentCount: number
}

export default defineEventHandler(async (event): Promise<ProcessResponse> => {
  const ai = useServerGemini()
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

  // Fetch video file
  const videoResponse = await fetch(videoUrl)
  if (!videoResponse.ok) {
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch video from storage'
    })
  }

  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())

  // Fetch existing logic flows for context
  const { data: logicFlows } = await supabase
    .from('logic_flows')
    .select('id, name, description')

  const logicFlowsContext = logicFlows?.map(lf => `- ${lf.name}: ${lf.description}`).join('\n') || ''

  const videoDuration = video.duration_seconds ||
    Math.ceil(30) // fallback, will be refined by AI

  // Upload video to Gemini Files API
  let uploadedFile: { uri: string; mimeType: string; name: string }
  try {
    uploadedFile = await uploadVideoToGemini(ai, videoBuffer)
  } catch (err) {
    console.error('Video upload error:', err)
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Failed to upload video for processing'
    })
  }

  // Single combined call: transcribe + analyze structure
  const prompt = `Analyze this short-form video. Perform two tasks:

1. TRANSCRIBE: Transcribe all spoken words with timestamps.
2. ANALYZE STRUCTURE: Identify the video's content structure pattern.

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

    const analysis = JSON.parse(content) as {
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
    const actualDuration = video.duration_seconds || videoDuration

    analysisResult = {
      logicFlowId,
      logicFlowName: analysis.logicFlowName,
      confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
      transcript: analysis.transcript || '',
      segments: (analysis.segments || [])
        .filter(seg => validLabels.includes(seg.label))
        .map(seg => ({
          label: seg.label,
          start_time: Math.max(0, seg.start_time),
          end_time: Math.min(actualDuration, Math.max(seg.start_time + 0.1, seg.end_time)),
          transcript_raw: seg.transcript_raw || '',
          script_blueprint: seg.script_blueprint || ''
        }))
        .filter(seg => seg.end_time > seg.start_time)
    }
  } catch (err) {
    console.error('Analysis error:', err)
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Analysis failed'
    })
  }

  // Update video record
  const { error: updateError } = await supabase
    .from('videos')
    .update({
      logic_flow_id: analysisResult.logicFlowId,
      script_raw: analysisResult.transcript,
      duration_seconds: video.duration_seconds || videoDuration
    })
    .eq('id', videoId)

  if (updateError) {
    console.error('Video update error:', updateError)
    throw createError({
      statusCode: 500,
      message: 'Failed to update video record'
    })
  }

  // Delete existing segments and insert new ones
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
