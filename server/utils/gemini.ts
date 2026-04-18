import { GoogleGenAI } from '@google/genai'

const log = createLogger('gemini')

let geminiClient: GoogleGenAI | null = null

export function useServerGemini(): GoogleGenAI {
  if (!geminiClient) {
    const config = useRuntimeConfig()
    if (!config.geminiApiKey) {
      throw createError({
        statusCode: 500,
        message: 'Gemini API key not configured'
      })
    }
    geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey as string })
    log.info('Gemini client initialized')
  }
  return geminiClient
}

/**
 * Upload a video buffer to the Gemini Files API and wait for it to become active.
 * Returns the file URI and metadata needed for generateContent calls.
 */
export async function uploadVideoToGemini(
  ai: GoogleGenAI,
  videoBuffer: Buffer,
  mimeType: string = 'video/mp4'
): Promise<{ uri: string; mimeType: string; name: string }> {
  const { writeFile, unlink, mkdtemp } = await import('fs/promises')
  const { tmpdir } = await import('os')
  const { join } = await import('path')

  const bufferSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2)
  const op = log.timedOp('upload video to Gemini Files API', { mimeType, sizeMB: bufferSizeMB })

  const ext = mimeType === 'video/webm' ? '.webm' : mimeType === 'video/quicktime' ? '.mov' : '.mp4'
  const tempDir = await mkdtemp(join(tmpdir(), 'gemini-upload-'))
  const tempPath = join(tempDir, `video${ext}`)

  try {
    await writeFile(tempPath, videoBuffer)
    log.info('Temp file written', { path: tempPath, sizeMB: bufferSizeMB })

    const uploadedFile = await ai.files.upload({
      file: tempPath,
      config: { mimeType }
    })

    if (!uploadedFile.uri || !uploadedFile.name) {
      throw new Error('File upload failed — no URI returned')
    }

    log.info('File uploaded, polling for ACTIVE state', { fileName: uploadedFile.name })

    // Poll until the file is processed and ACTIVE
    let file = await ai.files.get({ name: uploadedFile.name })
    const maxWait = 120_000 // 2 minutes
    const start = Date.now()
    let pollCount = 0

    while (file.state === 'PROCESSING' && Date.now() - start < maxWait) {
      pollCount++
      await new Promise(r => setTimeout(r, 2000))
      file = await ai.files.get({ name: uploadedFile.name })
    }

    if (file.state !== 'ACTIVE') {
      log.error('File processing failed', new Error(`State: ${file.state}`), { pollCount, elapsedMs: Date.now() - start })
      throw new Error(`File processing failed. State: ${file.state}`)
    }

    op.done({ fileName: file.name, pollCount, fileState: file.state })

    return {
      uri: file.uri!,
      mimeType: file.mimeType || mimeType,
      name: file.name!
    }
  } catch (err) {
    op.fail(err)
    throw err
  } finally {
    try { await unlink(tempPath) } catch { /* ignore cleanup errors */ }
    try {
      const { rmdir } = await import('fs/promises')
      await rmdir(tempDir)
    } catch { /* ignore */ }
  }
}

export const EMBEDDING_MODEL = 'gemini-embedding-001'
export const EMBEDDING_DIM = 768

/**
 * Embed a single text into a 768-dim vector via Gemini gemini-embedding-001.
 * The model returns 3072 dims natively; we request 768 via outputDimensionality
 * (Matryoshka truncation) to match the pgvector column. Input is clipped to
 * 8000 chars to stay under the model's token budget.
 */
export async function embedText(ai: GoogleGenAI, text: string): Promise<number[]> {
  const input = text.slice(0, 8000)
  const res = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: input,
    config: { outputDimensionality: EMBEDDING_DIM }
  })
  const values = res.embeddings?.[0]?.values
  if (!values || values.length === 0) {
    throw new Error('Gemini embedding returned no values')
  }
  return values
}
