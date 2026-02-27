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

const log = createLogger('analyze-visual')

export default defineEventHandler(async (event): Promise<AnalyzeVisualResponse> => {
  const ai = useServerGemini()
  const config = useRuntimeConfig()
  const body = await readBody<AnalyzeVisualRequest>(event)

  const videoId = validateUUID(body?.videoId, 'videoId')
  const pipeline = log.timedOp('visual analysis pipeline', { videoId })

  const supabase = useServerSupabase()

  // Fetch video record
  log.info('Fetching video record', { videoId })
  const { data: videoData, error: videoError } = await supabase
    .from('videos')
    .select('id, video_path, duration_seconds')
    .eq('id', videoId)
    .single()

  if (videoError || !videoData) {
    log.error('Video not found', videoError, { videoId })
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
    log.warn('No segments found, cannot perform visual analysis', { videoId })
    throw createError({
      statusCode: 400,
      message: 'Video must have segments before visual analysis. Process the video first.'
    })
  }

  log.info('Video and segments loaded', { videoId, videoPath: video.video_path, durationSeconds: video.duration_seconds, segmentCount: segments.length })

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

  log.info('Status set to processing', { videoId })

  try {
    // Fetch and upload video to Gemini
    const supabaseUrl = config.supabaseUrl as string
    const videoUrl = `${supabaseUrl}/storage/v1/object/public/videos/${video.video_path}`

    const fetchOp = log.timedOp('fetch video from storage', { videoId })
    const videoResponse = await fetch(videoUrl)
    if (!videoResponse.ok) {
      fetchOp.fail(new Error(`HTTP ${videoResponse.status}`))
      throw new Error('Failed to fetch video from storage')
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
    const bufferSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2)
    fetchOp.done({ sizeMB: bufferSizeMB })

    const uploadedFile = await uploadVideoToGemini(ai, videoBuffer)

    const duration = video.duration_seconds || 30

    const segmentContext = segments
      .map(s => `[${s.label}] ${s.start_time.toFixed(1)}s - ${s.end_time.toFixed(1)}s`)
      .join('\n')

    const visualTags = [
      'Green Screen', 'POV', 'Match Cut', 'Text Overlay',
      'Split Screen', 'UGC Style', 'Professional/Studio', 'Talking Head'
    ]

    const prompt = `You are an expert video editor. Analyze this ${duration}-second video and produce BOTH a visual analysis AND actionable editing instructions that someone could use to recreate the editing style.

The video has these segments:
${segmentContext}

Known visual tags to detect: ${visualTags.join(', ')}

For EACH segment, provide:

**VISUAL ANALYSIS:**
1. camera_movements: Array of camera movements (e.g., "static", "slow zoom in", "pan left", "handheld shake")
2. shot_types: Array of shot types (e.g., "close-up", "medium shot", "wide shot", "extreme close-up")
3. color_grading: { dominant_colors: string[], mood: string, style: string }
4. scene_composition: How the frame is composed (rule of thirds, centered, etc.)
5. text_overlays: { detected: boolean, items: [{ text, style, position }] } — IGNORE watermarks, usernames, @handles, platform logos, and TikTok/Instagram UI elements. Only include intentional creator-added text overlays (captions, callouts, labels).
6. transitions: Transition TO the next segment { type, description } or null for last segment
7. visual_pacing: Description of the editing pace in this segment
8. branding_elements: Array of branding elements visible
9. thumbnail_worthy_frames: Descriptions of frames that would make good thumbnails
10. detected_visual_tags: Which tags from the known list apply to this segment

**EDITING INSTRUCTIONS (the key part — be specific and actionable):**
11. editing_instructions: Concrete editing spec for this segment:
  - cuts: Array of cuts/splices in this segment. Each: { timestamp (relative to segment start, e.g. "0.0s", "1.2s"), type (e.g. "jump cut", "j-cut", "l-cut", "match cut", "hard cut", "cutaway"), description (what happens at this cut) }
  - effects: Array of visual effects applied. Each: { type (e.g. "shake", "blur", "flash", "glow", "vignette", "grain", "glitch"), parameters (specifics like "slight horizontal shake, 3px amplitude"), timing (e.g. "on beat drop at 0.5s", "throughout segment") }
  - speed_changes: Array of speed ramps/changes. Each: { range (e.g. "0.0s-0.8s"), speed (e.g. "0.5x slow motion", "2x speed up", "1x normal"), reason (why this speed change is used) }
  - zoom_keyframes: Array of zoom/scale keyframes. Each: { timestamp (e.g. "0.0s"), zoom_level (e.g. "100%", "120%", "150%"), direction (e.g. "zoom in slowly", "snap zoom", "zoom out") }
  - text_to_add: Array of text elements the creator added (NOT watermarks). Each: { text (use [PLACEHOLDER] for specific names/numbers, keep generic text as-is), appear_at (timestamp), duration (e.g. "1.5s"), style (font style, weight, size description), position (e.g. "center", "bottom-third", "top-left"), animation (e.g. "pop in", "typewriter", "fade in", "slide up", "none") }
  - color_grade_preset: A one-line description of the color grading that could be applied as a preset (e.g. "warm vintage with lifted blacks and orange-teal split toning", "clean neutral with slightly boosted saturation")
  - audio_sync_notes: How the editing syncs with audio/music beats (e.g. "cuts land on every other beat", "zoom syncs with bass drop", "text appears on vocal pauses")

OVERALL video visual assessment:
- overall_style: Brief description of the video's visual style
- editing_pace: Overall editing pace (include approximate cuts per second)
- production_quality: "low", "medium", "high", or "professional"
- aspect_ratio: Detected aspect ratio
- notable_techniques: Key visual/editing techniques used

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
      "text_overlays": { "detected": true, "items": [{ "text": "string", "style": "string", "position": "string" }] },
      "transitions": { "type": "string", "description": "string" },
      "visual_pacing": "string",
      "branding_elements": ["string"],
      "thumbnail_worthy_frames": ["string"],
      "detected_visual_tags": ["string"],
      "editing_instructions": {
        "cuts": [{ "timestamp": "string", "type": "string", "description": "string" }],
        "effects": [{ "type": "string", "parameters": "string", "timing": "string" }],
        "speed_changes": [{ "range": "string", "speed": "string", "reason": "string" }],
        "zoom_keyframes": [{ "timestamp": "string", "zoom_level": "string", "direction": "string" }],
        "text_to_add": [{ "text": "string", "appear_at": "string", "duration": "string", "style": "string", "position": "string", "animation": "string" }],
        "color_grade_preset": "string",
        "audio_sync_notes": "string"
      }
    }
  ]
}`

    const geminiOp = log.timedOp('Gemini visual analysis', { videoId, model: 'gemini-2.5-flash', durationSeconds: duration, segmentCount: segments.length })
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

    geminiOp.done({
      hasOverview: !!result.overview,
      analyzedSegments: result.segments?.length || 0,
      productionQuality: result.overview?.production_quality,
      notableTechniques: result.overview?.notable_techniques?.length || 0
    })

    const visualAnalysis: VideoVisualAnalysis = {
      status: 'completed',
      analyzed_at: new Date().toISOString(),
      error: null,
      overview: result.overview || null,
      segments: result.segments || null
    }

    log.info('Saving visual analysis to database', { videoId })
    await supabase.from('videos')
      .update({ visual_analysis: visualAnalysis as unknown as Json })
      .eq('id', videoId)

    pipeline.done({
      productionQuality: result.overview?.production_quality,
      analyzedSegments: result.segments?.length || 0
    })

    return { success: true, visualAnalysis }
  } catch (error) {
    pipeline.fail(error)

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
