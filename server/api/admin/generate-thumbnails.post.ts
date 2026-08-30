import { readFile } from 'node:fs/promises'
import { extractThumbnailFromVideo } from '~~/server/utils/audio'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ batchSize?: number }>(event).catch(() => ({}))
  const batchSize = Math.min(Math.max(body?.batchSize || 5, 1), 20)

  const supabase = useServerSupabase()

  // Count remaining for progress reporting
  const { count: totalRemaining } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .is('thumbnail_path', null)

  const { data: videosWithoutThumbs, error: fetchErr } = await supabase
    .from('videos')
    .select('id, video_path, source_url')
    .is('thumbnail_path', null)
    .limit(batchSize)

  if (fetchErr || !videosWithoutThumbs) {
    throw createError({
      statusCode: 500,
      message: `Failed to fetch videos: ${fetchErr?.message}`
    })
  }

  const processed: string[] = []
  const errors: { id: string; error: string }[] = []

  for (const video of videosWithoutThumbs) {
    let cleanup: (() => Promise<void>) | null = null
    try {
      let videoBuffer: Buffer

      if (video.video_path) {
        const { data: blob, error: downloadErr } = await supabase.storage
          .from('videos')
          .download(video.video_path)

        if (downloadErr || !blob) {
          errors.push({ id: video.id, error: `Download failed: ${downloadErr?.message}` })
          continue
        }
        videoBuffer = Buffer.from(await blob.arrayBuffer())
      } else if (video.source_url) {
        // Embed-only row: nothing in storage, so re-resolve the original video.
        const result = await downloadTikTokToTemp(video.source_url)
        cleanup = result.cleanup
        videoBuffer = await readFile(result.path)
        if (videoBuffer.length < 100 * 1024) {
          errors.push({ id: video.id, error: 'Resolver returned a stub, not the video' })
          continue
        }
      } else {
        errors.push({ id: video.id, error: 'No video_path and no source_url' })
        continue
      }

      const thumbnailBuffer = await extractThumbnailFromVideo(videoBuffer)
      if (!thumbnailBuffer) {
        errors.push({ id: video.id, error: 'Thumbnail extraction failed' })
        continue
      }

      const thumbName = `thumbnails/${crypto.randomUUID()}.jpg`
      const { error: uploadErr } = await supabase.storage
        .from('videos')
        .upload(thumbName, thumbnailBuffer, { contentType: 'image/jpeg', upsert: false })

      if (uploadErr) {
        errors.push({ id: video.id, error: `Upload failed: ${uploadErr.message}` })
        continue
      }

      const { error: updateErr } = await supabase
        .from('videos')
        .update({ thumbnail_path: thumbName, thumbnail_url: null })
        .eq('id', video.id)

      if (updateErr) {
        errors.push({ id: video.id, error: `DB update failed: ${updateErr.message}` })
        continue
      }

      processed.push(video.id)
    } catch (err) {
      errors.push({ id: video.id, error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      if (cleanup) await cleanup().catch(() => {})
    }
  }

  const remaining = Math.max(0, (totalRemaining || 0) - processed.length)

  return {
    processed: processed.length,
    remaining,
    errors
  }
})
