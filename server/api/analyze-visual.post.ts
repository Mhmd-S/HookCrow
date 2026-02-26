import type { VideoVisualAnalysis, SegmentVisualAnalysis, VideoVisualOverview } from '~/types'
import type { Json } from '~/types/database'

interface AnalyzeVisualRequest {
  videoId: string
}

interface AnalyzeVisualResponse {
  success: boolean
  visualAnalysis: VideoVisualAnalysis
}

interface VideoRecord {
  id: string
  video_path: string
  duration_seconds: number | null
}

interface SegmentRecord {
  id: string
  start_time: number
  end_time: number
  label: string
  segment_order: number
}

export default defineEventHandler(async (event): Promise<AnalyzeVisualResponse> => {
  const ai = useServerGemini()
  const config = useRuntimeConfig()
  const body = await readBody<AnalyzeVisualRequest>(event)

  const videoId = validateUUID(body?.videoId, 'videoId')

  const supabase = useServerSupabase()

  // Fetch video record
  const { data: videoData, error: videoError } = await supabase
    .from('videos')
    .select('id, video_path, duration_seconds')
    .eq('id', videoId)
    .single()

  if (videoError || !videoData) {
    throw createError({
      statusCode: 404,
      message: 'Video not found'
    })
  }

  const video = videoData as VideoRecord

  // Fetch segments for per-segment analysis
  const { data: segmentsData } = await supabase
    .from('segments')
    .select('id, start_time, end_time, label, segment_order')
    .eq('video_id', videoId)
    .order('segment_order')

  const segments = (segmentsData || []) as SegmentRecord[]

  if (segments.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Video must have segments before visual analysis. Process the video first.'
    })
  }

  // Update status to processing
  await supabase.from('videos').update({
    visual_analysis: {
      status: 'processing',
      analyzed_at: null,
      error: null,
      overview: null,
      segments: null
    } as unknown as Json
  }).eq('id', videoId)

  try {
    // Fetch and upload video to Gemini
    const supabaseUrl = config.public.supabaseUrl as string
    const videoUrl = `${supabaseUrl}/storage/v1/object/public/videos/${video.video_path}`

    const videoResponse = await fetch(videoUrl)
    if (!videoResponse.ok) {
      throw new Error('Failed to fetch video from storage')
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
    const uploadedFile = await uploadVideoToGemini(ai, videoBuffer)

    const duration = video.duration_seconds || 30

    const segmentContext = segments
      .map(s => `[${s.label}] ${s.start_time.toFixed(1)}s - ${s.end_time.toFixed(1)}s`)
      .join('\n')

    const visualTags = [
      'Green Screen', 'POV', 'Match Cut', 'Text Overlay',
      'Split Screen', 'UGC Style', 'Professional/Studio', 'Talking Head'
    ]

    const prompt = `Perform a comprehensive VISUAL analysis of this ${duration}-second video.

The video has these segments:
${segmentContext}

Known visual tags to detect: ${visualTags.join(', ')}

For EACH segment, analyze:
1. camera_movements: Array of camera movements (e.g., "static", "slow zoom in", "pan left", "handheld shake")
2. shot_types: Array of shot types (e.g., "close-up", "medium shot", "wide shot", "extreme close-up")
3. color_grading: { dominant_colors: string[], mood: string, style: string }
4. scene_composition: How the frame is composed (rule of thirds, centered, etc.)
5. text_overlays: { detected: boolean, items: [{ text, style, position }] }
6. transitions: Transition TO the next segment { type, description } or null for last segment
7. visual_pacing: Description of the editing pace in this segment
8. branding_elements: Array of branding elements visible
9. thumbnail_worthy_frames: Descriptions of frames that would make good thumbnails
10. detected_visual_tags: Which tags from the known list apply to this segment

Also provide an OVERALL video visual assessment:
- overall_style: Brief description of the video's visual style
- editing_pace: Overall editing pace
- production_quality: "low", "medium", "high", or "professional"
- aspect_ratio: Detected aspect ratio
- notable_techniques: Key visual techniques used

Return JSON:
{
  "overview": {
    "overall_style": "string",
    "editing_pace": "string",
    "production_quality": "low|medium|high|professional",
    "aspect_ratio": "string",
    "notable_techniques": ["string"]
  },
  "segments": [
    {
      "camera_movements": ["string"],
      "shot_types": ["string"],
      "color_grading": { "dominant_colors": ["string"], "mood": "string", "style": "string" },
      "scene_composition": "string",
      "text_overlays": { "detected": boolean, "items": [{ "text": "string", "style": "string", "position": "string" }] },
      "transitions": { "type": "string", "description": "string" } or null,
      "visual_pacing": "string",
      "branding_elements": ["string"],
      "thumbnail_worthy_frames": ["string"],
      "detected_visual_tags": ["string"]
    }
  ]
}`

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

    const result = JSON.parse(response.text || '{}')

    const visualAnalysis: VideoVisualAnalysis = {
      status: 'completed',
      analyzed_at: new Date().toISOString(),
      error: null,
      overview: result.overview || null,
      segments: result.segments || null
    }

    await supabase.from('videos')
      .update({ visual_analysis: visualAnalysis as unknown as Json })
      .eq('id', videoId)

    return { success: true, visualAnalysis }
  } catch (error) {
    console.error('Visual analysis error:', error)

    const failedAnalysis: VideoVisualAnalysis = {
      status: 'failed',
      analyzed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Visual analysis failed',
      overview: null,
      segments: null
    }

    await supabase.from('videos')
      .update({ visual_analysis: failedAnalysis as unknown as Json })
      .eq('id', videoId)

    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Visual analysis failed'
    })
  }
})
