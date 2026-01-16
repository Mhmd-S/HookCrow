import OpenAI from 'openai'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openaiApiKey) {
    throw createError({
      statusCode: 500,
      message: 'OpenAI API key not configured'
    })
  }

  const formData = await readMultipartFormData(event)

  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No audio/video file provided'
    })
  }

  const file = formData.find(f => f.name === 'file')

  if (!file || !file.data || !file.filename) {
    throw createError({
      statusCode: 400,
      message: 'Invalid file'
    })
  }

  // Validate file size (25MB max for Whisper)
  const maxSize = 25 * 1024 * 1024
  if (file.data.length > maxSize) {
    throw createError({
      statusCode: 400,
      message: 'File too large. Maximum 25MB for transcription.'
    })
  }

  const openai = new OpenAI({
    apiKey: config.openaiApiKey as string
  })

  try {
    // Create a File object for OpenAI
    const blob = new Blob([file.data], { type: file.type || 'video/mp4' })
    const audioFile = new File([blob], file.filename, { type: file.type || 'video/mp4' })

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    })

    return {
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
})
