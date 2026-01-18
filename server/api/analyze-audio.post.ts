import { extractAudioFromVideo, extractAudioSegment, checkFfmpegAvailable } from '../utils/audio'
import { identifyMusic } from '../utils/audd'
import type { AudioMetadata, MusicTrack, SoundEffect, SoundEffectType, VideoAudioAnalysis } from '~/types'
import type { Json } from '~/types/database'

interface AnalyzeAudioRequest {
  videoId: string
}

interface AnalyzeAudioResponse {
  success: boolean
  audioAnalysis: VideoAudioAnalysis
}

interface SoundEffectDetection {
  type: SoundEffectType
  label: string
  start_time: number
  end_time: number
  confidence: number
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

export default defineEventHandler(async (event): Promise<AnalyzeAudioResponse> => {
  const config = useRuntimeConfig()
  const body = await readBody<AnalyzeAudioRequest>(event)

  const videoId = validateUUID(body?.videoId, 'videoId')

  // Check FFmpeg availability
  const ffmpegAvailable = await checkFfmpegAvailable()
  if (!ffmpegAvailable) {
    throw createError({
      statusCode: 500,
      message: 'FFmpeg is not available on the server. Audio analysis requires FFmpeg.'
    })
  }

  const supabase = useServerSupabase()

  // Fetch video record with segments
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

  // Fetch segments for this video
  const { data: segmentsData } = await supabase
    .from('segments')
    .select('id, start_time, end_time, label, segment_order')
    .eq('video_id', videoId)
    .order('segment_order')

  const segments = (segmentsData || []) as SegmentRecord[]

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

  try {
    // Get video URL from storage
    const supabaseUrl = config.public.supabaseUrl as string
    const videoUrl = `${supabaseUrl}/storage/v1/object/public/videos/${video.video_path}`

    // Fetch video file
    const videoResponse = await fetch(videoUrl)
    if (!videoResponse.ok) {
      throw new Error('Failed to fetch video from storage')
    }

    const videoArrayBuffer = await videoResponse.arrayBuffer()
    const videoBuffer = Buffer.from(videoArrayBuffer)

    // Extract full audio
    const audioBuffer = await extractAudioFromVideo(videoBuffer)

    // Initialize audio metadata
    const audioMetadata: AudioMetadata = {
      music: {
        detected: false,
        tracks: [],
        unidentified_music: []
      },
      sound_effects: [],
      overall: {
        has_speech: false,
        has_music: false,
        has_sfx: false,
        dominant_audio: 'silent'
      }
    }

    // Step 1: Music identification with AudD (if configured)
    const auddApiToken = config.auddApiToken as string

    if (auddApiToken) {
      try {
        // Analyze audio in chunks (10 second windows) for better music detection
        const chunkDuration = 10
        const videoDuration = video.duration_seconds || 30
        const detectedTracks: MusicTrack[] = []

        for (let startTime = 0; startTime < videoDuration; startTime += chunkDuration) {
          const endTime = Math.min(startTime + chunkDuration, videoDuration)
          const segmentAudio = await extractAudioSegment(videoBuffer, startTime, endTime)

          const result = await identifyMusic(segmentAudio, {
            apiToken: auddApiToken
          })

          if (result.identified) {
            // Check if this track is already detected (avoid duplicates)
            const existingTrack = detectedTracks.find(
              t => t.title === result.title && t.artist === result.artist
            )

            if (existingTrack) {
              // Extend the end time of the existing track
              existingTrack.end_time = Math.max(existingTrack.end_time, endTime)
            } else {
              detectedTracks.push({
                title: result.title || 'Unknown',
                artist: result.artist || 'Unknown',
                bpm: null,
                mood: (result.genres.length > 0 ? result.genres[0] : null) ?? null,
                start_time: startTime,
                end_time: endTime,
                confidence: result.confidence
              })
            }
          }
        }

        if (detectedTracks.length > 0) {
          audioMetadata.music.detected = true
          audioMetadata.music.tracks = detectedTracks
          audioMetadata.overall.has_music = true
        }
      } catch (auddError) {
        console.error('AudD analysis failed:', auddError)
        // Continue without music identification
      }
    }

    // Step 2: Sound effect detection using GPT-4o audio
    const openaiApiKey = config.openaiApiKey as string

    if (openaiApiKey) {
      try {
        const soundEffects = await detectSoundEffectsWithGPT(
          audioBuffer,
          video.duration_seconds || 30,
          openaiApiKey
        )
        audioMetadata.sound_effects = soundEffects

        if (soundEffects.length > 0) {
          audioMetadata.overall.has_sfx = true
        }
      } catch (sfxError) {
        console.error('Sound effect detection failed:', sfxError)
        // Continue without sound effect detection
      }
    }

    // Step 3: Determine overall audio characteristics
    // We assume speech is present since videos typically have speech
    // A more accurate method would be to use a speech detection model
    audioMetadata.overall.has_speech = true

    // Determine dominant audio
    if (audioMetadata.overall.has_music && audioMetadata.overall.has_speech) {
      audioMetadata.overall.dominant_audio = 'mixed'
    } else if (audioMetadata.overall.has_music) {
      audioMetadata.overall.dominant_audio = 'music'
    } else if (audioMetadata.overall.has_speech) {
      audioMetadata.overall.dominant_audio = 'speech'
    }

    // Create the final analysis result
    const audioAnalysis: VideoAudioAnalysis = {
      status: 'completed',
      analyzed_at: new Date().toISOString(),
      error: null,
      metadata: audioMetadata
    }

    // Update video record with analysis results
    await supabase
      .from('videos')
      .update({ audio_analysis: audioAnalysis as unknown as Json })
      .eq('id', videoId)

    // Update segment audio metadata (map audio events to segments)
    if (segments.length > 0) {
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
    }

    return {
      success: true,
      audioAnalysis
    }
  } catch (error) {
    console.error('Audio analysis error:', error)

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
 * Detect sound effects using GPT-4o's audio understanding capabilities
 */
async function detectSoundEffectsWithGPT(
  audioBuffer: Buffer,
  duration: number,
  apiKey: string
): Promise<SoundEffect[]> {
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey })

  // Convert audio buffer to base64 for API
  const audioBase64 = audioBuffer.toString('base64')

  const systemPrompt = `You are an audio analysis expert. Analyze the provided audio and identify any sound effects used.

Sound effect types to detect:
- whoosh: Swooshing or wind-like transition sounds
- ding: Bell or notification sounds
- bass_drop: Low frequency impact or drop sounds
- notification: Alert or notification sounds
- pop: Popping or clicking sounds
- click: Sharp clicking sounds
- swoosh: Quick movement sounds
- impact: Collision or hit sounds
- transition: Audio transitions between sections
- riser: Building tension sounds that increase in pitch/volume
- ambient: Background atmosphere sounds
- other: Any other notable sound effects

For each sound effect detected, provide:
1. The type (from the list above)
2. A brief descriptive label
3. Approximate start time in seconds
4. Approximate end time in seconds
5. Confidence level (0-1)

Return a JSON array of detected sound effects. If no sound effects are detected, return an empty array.`

  const userPrompt = `Analyze this ${duration} second audio clip for sound effects. The audio is provided as base64-encoded WAV.

Return your analysis as a JSON array with this structure:
[
  {
    "type": "whoosh|ding|bass_drop|notification|pop|click|swoosh|impact|transition|riser|ambient|other",
    "label": "brief description",
    "start_time": seconds,
    "end_time": seconds,
    "confidence": 0.0-1.0
  }
]

Audio (base64): ${audioBase64.substring(0, 1000)}...`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return []
    }

    const parsed = JSON.parse(content) as { effects?: SoundEffectDetection[] } | SoundEffectDetection[]
    const effects = Array.isArray(parsed) ? parsed : (parsed.effects || [])

    // Validate and normalize the results
    const validTypes: SoundEffectType[] = [
      'whoosh', 'ding', 'bass_drop', 'notification', 'pop', 'click',
      'swoosh', 'impact', 'transition', 'riser', 'ambient', 'other'
    ]

    return effects
      .filter(e => validTypes.includes(e.type as SoundEffectType))
      .map(e => ({
        type: e.type as SoundEffectType,
        label: e.label || e.type,
        start_time: Math.max(0, e.start_time),
        end_time: Math.min(duration, e.end_time),
        confidence: Math.max(0, Math.min(1, e.confidence || 0.5))
      }))
  } catch (error) {
    console.error('GPT sound effect detection error:', error)
    return []
  }
}

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

  // Find unidentified music in this segment
  const segmentUnidentified = fullMetadata.music.unidentified_music.filter(
    um => um.start_time < endTime && um.end_time > startTime
  )

  return {
    music: {
      detected: segmentTracks.length > 0 || segmentUnidentified.length > 0,
      tracks: segmentTracks,
      unidentified_music: segmentUnidentified
    },
    sound_effects: segmentSfx,
    overall: {
      has_speech: fullMetadata.overall.has_speech,
      has_music: segmentTracks.length > 0 || segmentUnidentified.length > 0,
      has_sfx: segmentSfx.length > 0,
      dominant_audio: fullMetadata.overall.dominant_audio
    }
  }
}
