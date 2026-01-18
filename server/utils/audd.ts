interface AudDConfig {
  apiToken: string
}

interface AudDResult {
  artist: string
  title: string
  album: string
  release_date: string
  label: string
  timecode: string
  song_link: string
  spotify?: {
    album?: {
      name: string
      release_date: string
    }
    artists?: Array<{ name: string }>
    external_urls?: { spotify: string }
    name: string
  }
  apple_music?: {
    albumName: string
    artistName: string
    name: string
    url: string
    genreNames?: string[]
  }
}

interface AudDResponse {
  status: 'success' | 'error'
  result: AudDResult | null
  error?: {
    error_code: number
    error_message: string
  }
}

export interface MusicIdentificationResult {
  identified: boolean
  title: string | null
  artist: string | null
  album: string | null
  genres: string[]
  confidence: number
  releaseDate: string | null
  spotifyUrl: string | null
  appleMusicUrl: string | null
}

/**
 * Identify music in audio buffer using AudD
 * Simple API - just send audio and get results
 */
export async function identifyMusic(
  audioBuffer: Buffer,
  config: AudDConfig
): Promise<MusicIdentificationResult> {
  // Convert Buffer to Uint8Array for Blob compatibility
  const audioArray = new Uint8Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength)

  const formData = new FormData()
  formData.append('file', new Blob([audioArray], { type: 'audio/wav' }), 'audio.wav')
  formData.append('api_token', config.apiToken)
  formData.append('return', 'apple_music,spotify')

  try {
    const response = await fetch('https://api.audd.io/', {
      method: 'POST',
      body: formData
    })

    const data: AudDResponse = await response.json()

    if (data.status === 'error') {
      throw new Error(`AudD error: ${data.error?.error_message || 'Unknown error'}`)
    }

    if (!data.result) {
      return {
        identified: false,
        title: null,
        artist: null,
        album: null,
        genres: [],
        confidence: 0,
        releaseDate: null,
        spotifyUrl: null,
        appleMusicUrl: null
      }
    }

    const result = data.result

    return {
      identified: true,
      title: result.title || result.spotify?.name || result.apple_music?.name || null,
      artist: result.artist || result.spotify?.artists?.[0]?.name || result.apple_music?.artistName || null,
      album: result.album || result.spotify?.album?.name || result.apple_music?.albumName || null,
      genres: result.apple_music?.genreNames || [],
      confidence: 100,
      releaseDate: result.release_date || result.spotify?.album?.release_date || null,
      spotifyUrl: result.spotify?.external_urls?.spotify || null,
      appleMusicUrl: result.apple_music?.url || null
    }
  } catch (error) {
    console.error('AudD identification error:', error)
    throw error
  }
}

/**
 * Identify music in multiple segments of audio
 */
export async function identifyMusicInSegments(
  audioSegments: Array<{ buffer: Buffer; startTime: number; endTime: number }>,
  config: AudDConfig
): Promise<
  Array<{
    startTime: number
    endTime: number
    result: MusicIdentificationResult
  }>
> {
  const results = []

  for (const segment of audioSegments) {
    try {
      const result = await identifyMusic(segment.buffer, config)
      results.push({
        startTime: segment.startTime,
        endTime: segment.endTime,
        result
      })
    } catch (error) {
      console.error(`Error identifying music in segment ${segment.startTime}-${segment.endTime}:`, error)
      results.push({
        startTime: segment.startTime,
        endTime: segment.endTime,
        result: {
          identified: false,
          title: null,
          artist: null,
          album: null,
          genres: [],
          confidence: 0,
          releaseDate: null,
          spotifyUrl: null,
          appleMusicUrl: null
        }
      })
    }

    // Small delay between requests to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  return results
}
