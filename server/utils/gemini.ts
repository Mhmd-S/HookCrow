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
