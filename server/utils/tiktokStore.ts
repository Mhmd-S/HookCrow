import { readFile } from 'node:fs/promises'
import { getVideoDuration } from '~~/server/utils/audio'

const log = createLogger('tiktok-store')

// tikwm sometimes returns a ~120KB error payload instead of the mp4.
const MIN_VIDEO_BYTES = 100 * 1024
// Matches the `videos` bucket's per-file limit (same cap as ingestCreativeAd.ts).
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

export interface StoredTikTokVideo {
  buffer: Buffer
  videoPath: string
  durationSeconds: number | null
  // Delete the stored object (rollback). Never throws.
  remove: () => Promise<void>
}

/**
 * Download a TikTok post's mp4 and copy it into the `videos` bucket so our own
 * player serves it (the TikTok embed is not a durable playback source). Used by
 * ingest and by the video backfill. Returns the buffer so ingest can analyze it
 * without a second download.
 */
export async function downloadAndStoreTikTok(
  url: string,
  supabase: ReturnType<typeof useServerSupabase>,
): Promise<StoredTikTokVideo> {
  const download = await downloadTikTokToTemp(url)
  let buffer: Buffer
  try {
    buffer = await readFile(download.path)
  } finally {
    await download.cleanup()
  }

  if (buffer.length < MIN_VIDEO_BYTES) {
    throw new Error(`Download too small (${(buffer.length / 1024).toFixed(0)}KB) — resolver returned a stub, not the video`)
  }
  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new Error(`Download too large (${(buffer.length / 1024 / 1024).toFixed(0)}MB) — over the bucket's file limit`)
  }

  // Best-effort: a missing duration must not block storing the video.
  let durationSeconds: number | null = null
  try {
    const seconds = await getVideoDuration(buffer)
    if (Number.isFinite(seconds) && seconds > 0) durationSeconds = Math.round(seconds)
  } catch (err) {
    log.warn('ffprobe duration failed', { url, error: err instanceof Error ? err.message : String(err) })
  }

  const videoPath = `videos/${crypto.randomUUID()}.mp4`
  const { error: uploadErr } = await supabase.storage
    .from('videos')
    .upload(videoPath, buffer, { contentType: 'video/mp4', upsert: false })

  if (uploadErr) {
    throw new Error(`Storage upload failed: ${uploadErr.message}`)
  }

  log.info('Stored TikTok video', {
    url,
    videoPath,
    sizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
    durationSeconds,
  })

  const remove = async () => {
    try {
      const { error } = await supabase.storage.from('videos').remove([videoPath])
      if (error) log.warn('Failed to remove stored video', { videoPath, error: error.message })
    } catch (err) {
      log.warn('Failed to remove stored video', { videoPath, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { buffer, videoPath, durationSeconds, remove }
}
