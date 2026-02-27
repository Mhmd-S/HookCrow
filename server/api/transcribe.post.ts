const log = createLogger('transcribe')

export default defineEventHandler(async (event) => {
  const ai = useServerGemini()
  const op = log.timedOp('transcription')

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

  // Gemini supports up to 2GB, but keep a reasonable limit
  const maxSize = 100 * 1024 * 1024
  if (file.data.length > maxSize) {
    throw createError({
      statusCode: 400,
      message: 'File too large. Maximum 100MB for transcription.'
    })
  }

  const fileSizeMB = (file.data.length / (1024 * 1024)).toFixed(2)
  log.info('File received', { filename: file.filename, sizeMB: fileSizeMB, mimeType: file.type })

  try {
    // Upload to Gemini Files API
    const uploadedFile = await uploadVideoToGemini(
      ai,
      Buffer.from(file.data),
      file.type || 'video/mp4'
    )

    const geminiOp = log.timedOp('Gemini transcription', { model: 'gemini-2.5-flash' })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        role: 'user',
        parts: [
          { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
          { text: `Transcribe all spoken words in this video/audio with precise timestamps.

Return a JSON object with this exact structure:
{
  "text": "full transcript as a single string",
  "segments": [
    { "start": 0.0, "end": 3.5, "text": "transcribed text for this segment" }
  ]
}

Rules:
- Include ALL spoken words, exactly as said
- Segment boundaries should align with natural speech pauses or sentence boundaries
- Timestamps should be in seconds (decimal)
- If no speech is detected, return { "text": "", "segments": [] }` }
        ]
      },
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    })

    const result = JSON.parse(response.text || '{}')
    const segmentCount = result.segments?.length || 0
    const transcriptLength = result.text?.length || 0

    geminiOp.done({ segmentCount, transcriptLength })

    const mapped = {
      text: result.text || '',
      segments: (result.segments || []).map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text
      }))
    }

    op.done({ segmentCount: mapped.segments.length, transcriptLength: mapped.text.length })
    return mapped
  } catch (err) {
    op.fail(err)
    throw createError({
      statusCode: 500,
      message: err instanceof Error ? err.message : 'Transcription failed'
    })
  }
})
