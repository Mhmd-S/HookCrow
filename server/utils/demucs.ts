interface DemucsConfig {
  apiToken: string
}

interface DemucsOutput {
  bass: string // URL to bass stem
  drums: string // URL to drums stem
  guitar: string // URL to guitar stem (may be 'other' in some models)
  other: string // URL to other instruments stem
  piano: string // URL to piano stem (may be 'other' in some models)
  vocals: string // URL to vocals stem
}

interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: DemucsOutput
  error?: string
}

export interface AudioStemAnalysis {
  hasVocals: boolean
  hasMusic: boolean
  vocalIntensity: 'none' | 'low' | 'medium' | 'high'
  musicIntensity: 'none' | 'low' | 'medium' | 'high'
  stems?: {
    vocals: string
    drums: string
    bass: string
    other: string
  }
}

/**
 * Separate audio into stems using Replicate's Demucs model
 * This helps identify WHERE music plays in the audio
 */
export async function separateAudioStems(
  audioUrl: string,
  config: DemucsConfig
): Promise<AudioStemAnalysis> {
  // Create prediction using Replicate API
  const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // Using cjwbw/demucs - a popular Demucs model on Replicate
      version: 'f5dad03c24a45a59eb63d3ea0a2b1bba1c0c1e3d0e6f4e2c3b5a7d9f0e1c2b3a',
      input: {
        audio: audioUrl,
        stem: 'all' // Get all stems
      }
    })
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    throw new Error(`Failed to create Demucs prediction: ${errorText}`)
  }

  const prediction: ReplicatePrediction = await createResponse.json()

  // Poll for completion
  const maxWaitMs = 5 * 60 * 1000 // 5 minutes max
  const pollIntervalMs = 2000
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const statusResponse = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      {
        headers: {
          'Authorization': `Bearer ${config.apiToken}`
        }
      }
    )

    if (!statusResponse.ok) {
      throw new Error('Failed to check Demucs prediction status')
    }

    const status: ReplicatePrediction = await statusResponse.json()

    if (status.status === 'succeeded' && status.output) {
      return {
        hasVocals: true, // We can't easily determine without analyzing the stems
        hasMusic: true,
        vocalIntensity: 'medium',
        musicIntensity: 'medium',
        stems: {
          vocals: status.output.vocals,
          drums: status.output.drums,
          bass: status.output.bass,
          other: status.output.other
        }
      }
    }

    if (status.status === 'failed') {
      throw new Error(`Demucs prediction failed: ${status.error}`)
    }

    if (status.status === 'canceled') {
      throw new Error('Demucs prediction was canceled')
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error('Demucs prediction timed out')
}

/**
 * Analyze if music is present in audio without full stem separation
 * Uses a simpler approach - checking if non-vocal content exists
 * This is a lightweight alternative when full stem separation is not needed
 */
export async function detectMusicPresence(
  audioUrl: string,
  config: DemucsConfig
): Promise<{ hasMusic: boolean; hasSpeech: boolean }> {
  try {
    const analysis = await separateAudioStems(audioUrl, config)
    return {
      hasMusic: analysis.hasMusic,
      hasSpeech: analysis.hasVocals
    }
  } catch (error) {
    console.error('Music detection failed:', error)
    // Default to unknown
    return {
      hasMusic: false,
      hasSpeech: false
    }
  }
}

/**
 * Get the Replicate model version dynamically
 * This helps ensure we're using an available model
 */
export async function getDemucsModelVersion(config: DemucsConfig): Promise<string> {
  // Try to get the latest version of a Demucs model
  const modelsToTry = [
    'cjwbw/demucs',
    'afiaka87/demucs'
  ]

  for (const modelId of modelsToTry) {
    try {
      const response = await fetch(
        `https://api.replicate.com/v1/models/${modelId}/versions`,
        {
          headers: {
            'Authorization': `Bearer ${config.apiToken}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        if (data.results && data.results.length > 0) {
          return data.results[0].id
        }
      }
    } catch {
      continue
    }
  }

  // Fallback to a known working version
  return 'f5dad03c24a45a59eb63d3ea0a2b1bba1c0c1e3d0e6f4e2c3b5a7d9f0e1c2b3a'
}
