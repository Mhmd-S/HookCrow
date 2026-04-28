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
    .select('id, video_path')
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
    try {
      const { data: blob, error: downloadErr } = await supabase.storage
        .from('videos')
        .download(video.video_path)

      if (downloadErr || !blob) {
        errors.push({ id: video.id, error: `Download failed: ${downloadErr?.message}` })
        continue
      }

      const videoBuffer = Buffer.from(await blob.arrayBuffer())
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
        .update({ thumbnail_path: thumbName })
        .eq('id', video.id)

      if (updateErr) {
        errors.push({ id: video.id, error: `DB update failed: ${updateErr.message}` })
        continue
      }

      processed.push(video.id)
    } catch (err) {
      errors.push({ id: video.id, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const remaining = Math.max(0, (totalRemaining || 0) - processed.length)

  return {
    processed: processed.length,
    remaining,
    errors
  }
})
