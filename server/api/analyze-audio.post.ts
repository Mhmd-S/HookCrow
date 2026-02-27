import type { AudioMetadata, MusicTrack, SoundEffect, SoundEffectType, VideoAudioAnalysis } from '~/types'
import type { Json } from '~/types/database'

interface AnalyzeAudioRequest {
  videoId: string
}

interface AnalyzeAudioResponse {
  success: boolean
  audioAnalysis: VideoAudioAnalysis
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

const log = createLogger('analyze-audio')

export default defineEventHandler(async (event): Promise<AnalyzeAudioResponse> => {
  const ai = useServerGemini()
  const config = useRuntimeConfig()
  const body = await readBody<AnalyzeAudioRequest>(event)

  const videoId = validateUUID(body?.videoId, 'videoId')
  const pipeline = log.timedOp('audio analysis pipeline', { videoId })

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

  // Fetch segments for this video
  const { data: segmentsData } = await supabase
    .from('segments')
    .select('id, start_time, end_time, label, segment_order')
    .eq('video_id', videoId)
    .order('segment_order')

  const segments = (segmentsData || []) as SegmentRecord[]
  log.info('Video and segments loaded', { videoId, videoPath: video.video_path, durationSeconds: video.duration_seconds, segmentCount: segments.length })

  // Update analysis status to processing
  await supabase
    .from('videos')
    .update({
      audio_analysis: {
        status: 'processing',
        analyzed_at: null,
        error: null,
        metadata: null
      } as unknown as Json
    })
    .eq('id', videoId)

  log.info('Status set to processing', { videoId })

  try {
    // Get video URL from storage
    const supabaseUrl = config.supabaseUrl as string
    const videoUrl = `${supabaseUrl}/storage/v1/object/public/videos/${video.video_path}`

    // Fetch video file
    const fetchOp = log.timedOp('fetch video from storage', { videoId })
    const videoResponse = await fetch(videoUrl)
    if (!videoResponse.ok) {
      fetchOp.fail(new Error(`HTTP ${videoResponse.status}`))
      throw new Error('Failed to fetch video from storage')
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
    const bufferSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2)
    fetchOp.done({ sizeMB: bufferSizeMB })

    const duration = video.duration_seconds || 30

    // Upload video to Gemini Files API
    const uploadedFile = await uploadVideoToGemini(ai, videoBuffer)

    const geminiOp = log.timedOp('Gemini audio analysis', { videoId, model: 'gemini-2.5-flash', durationSeconds: duration })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        role: 'user',
        parts: [
          { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
          { text: `Analyze ALL audio in this ${duration}-second video. Detect:

1. MUSIC: Is there background music? For each music segment, provide:
   - Estimated title if recognizable (null if unknown)
   - Estimated artist if recognizable (null if unknown)
   - Genre/style (e.g., "lo-fi hip hop", "upbeat pop", "cinematic orchestral")
   - Estimated BPM (null if uncertain)
   - Start and end times in seconds
   - Confidence score (0-1)
   - Brief description of the music

2. SOUND EFFECTS: Detect any sound effects used. Valid types:
   whoosh, ding, bass_drop, notification, pop, click, swoosh, impact, transition, riser, ambient, other

3. OVERALL: Determine speech presence, music presence, SFX presence, and dominant audio type.

Return JSON:
{
  "music": {
    "detected": true/false,
    "tracks": [
      {
        "title": "string or null",
        "artist": "string or null",
        "genre": "string or null",
        "bpm": number or null,
        "start_time": number,
        "end_time": number,
        "confidence": 0.0-1.0,
        "description": "brief description of the music"
      }
    ]
  },
  "sound_effects": [
    {
      "type": "one of the valid types above",
      "label": "brief description",
      "start_time": number,
      "end_time": number,
      "confidence": 0.0-1.0
    }
  ],
  "overall": {
    "has_speech": true/false,
    "has_music": true/false,
    "has_sfx": true/false,
    "dominant_audio": "speech" | "music" | "mixed" | "silent"
  }
}` }
        ]
      },
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      }
    })

    const result = JSON.parse(response.text || '{}')

    // Validate sound effect types
    const validTypes: SoundEffectType[] = [
      'whoosh', 'ding', 'bass_drop', 'notification', 'pop', 'click',
      'swoosh', 'impact', 'transition', 'riser', 'ambient', 'other'
    ]

    const rawSfxCount = result.sound_effects?.length || 0

    // Build validated audio metadata
    const audioMetadata: AudioMetadata = {
      music: {
        detected: result.music?.detected || false,
        tracks: (result.music?.tracks || []).map((t: any): MusicTrack => ({
          title: t.title || null,
          artist: t.artist || null,
          genre: t.genre || null,
          bpm: t.bpm || null,
          start_time: Math.max(0, t.start_time || 0),
          end_time: Math.min(duration, t.end_time || duration),
          confidence: Math.max(0, Math.min(1, t.confidence || 0.5)),
          description: t.description || ''
        }))
      },
      sound_effects: (result.sound_effects || [])
        .filter((e: any) => validTypes.includes(e.type as SoundEffectType))
        .map((e: any): SoundEffect => ({
          type: e.type as SoundEffectType,
          label: e.label || e.type,
          start_time: Math.max(0, e.start_time),
          end_time: Math.min(duration, e.end_time),
          confidence: Math.max(0, Math.min(1, e.confidence || 0.5))
        })),
      overall: {
        has_speech: result.overall?.has_speech ?? true,
        has_music: result.overall?.has_music ?? false,
        has_sfx: result.overall?.has_sfx ?? false,
        dominant_audio: result.overall?.dominant_audio || 'speech'
      }
    }

    const filteredSfx = rawSfxCount - audioMetadata.sound_effects.length
    geminiOp.done({
      musicDetected: audioMetadata.music.detected,
      trackCount: audioMetadata.music.tracks.length,
      sfxCount: audioMetadata.sound_effects.length,
      sfxFilteredOut: filteredSfx > 0 ? filteredSfx : undefined,
      dominantAudio: audioMetadata.overall.dominant_audio
    })

    // Create the final analysis result
    const audioAnalysis: VideoAudioAnalysis = {
      status: 'completed',
      analyzed_at: new Date().toISOString(),
      error: null,
      metadata: audioMetadata
    }

    // Update video record with analysis results
    log.info('Saving audio analysis to database', { videoId })
    await supabase
      .from('videos')
      .update({ audio_analysis: audioAnalysis as unknown as Json })
      .eq('id', videoId)

    // Update segment audio metadata (map audio events to segments)
    if (segments.length > 0) {
      log.info('Mapping audio metadata to segments', { videoId, segmentCount: segments.length })
      for (const segment of segments) {
        const segmentAudioMetadata = getSegmentAudioMetadata(
          audioMetadata,
          segment.start_time,
          segment.end_time
        )

        await supabase
          .from('segments')
          .update({ audio_metadata: segmentAudioMetadata as unknown as Json })
          .eq('id', segment.id)
      }
      log.info('Segment audio metadata updated', { videoId, segmentsUpdated: segments.length })
    }

    pipeline.done({
      musicDetected: audioMetadata.music.detected,
      trackCount: audioMetadata.music.tracks.length,
      sfxCount: audioMetadata.sound_effects.length,
      dominantAudio: audioMetadata.overall.dominant_audio
    })

    return {
      success: true,
      audioAnalysis
    }
  } catch (error) {
    pipeline.fail(error)

    // Update analysis status to failed
    const failedAnalysis: VideoAudioAnalysis = {
      status: 'failed',
      analyzed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Analysis failed',
      metadata: null
    }

    await supabase
      .from('videos')
      .update({ audio_analysis: failedAnalysis as unknown as Json })
      .eq('id', videoId)

    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Audio analysis failed'
    })
  }
})

/**
 * Extract audio metadata relevant to a specific segment time range
 */
function getSegmentAudioMetadata(
  fullMetadata: AudioMetadata,
  startTime: number,
  endTime: number
): Partial<AudioMetadata> {
  // Find music tracks that overlap with this segment
  const segmentTracks = fullMetadata.music.tracks.filter(
    track => track.start_time < endTime && track.end_time > startTime
  )

  // Find sound effects within this segment
  const segmentSfx = fullMetadata.sound_effects.filter(
    sfx => sfx.start_time >= startTime && sfx.start_time < endTime
  )

  return {
    music: {
      detected: segmentTracks.length > 0,
      tracks: segmentTracks
    },
    sound_effects: segmentSfx,
    overall: {
      has_speech: fullMetadata.overall.has_speech,
      has_music: segmentTracks.length > 0,
      has_sfx: segmentSfx.length > 0,
      dominant_audio: fullMetadata.overall.dominant_audio
    }
  }
}
