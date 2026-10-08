// Copy the mp4 of embed-only TikTok rows (video_path NULL) into the `videos`
// bucket so our own player serves them. Mirrors generate-thumbnails.post.ts.

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  // offset: rows that failed earlier in this run stay NULL and sort first, so
  // the caller passes its running error count to skip past them instead of
  // retrying the same dead posts every batch.
  type Body = { batchSize?: number; offset?: number }
  const body = await readBody<Body>(event).catch((): Body => ({}))
  const batchSize = Math.min(Math.max(body?.batchSize || 3, 1), 10)
  const offset = Math.max(body?.offset || 0, 0)

  const supabase = useServerSupabase()

  // A TikTok ingest in flight also has video_path NULL until it finishes; skip
  // recent rows so we don't race it and orphan a second copy of the mp4.
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  // Count remaining for progress reporting
  const { count: totalRemaining } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .is('video_path', null)
    .not('source_url', 'is', null)
    .lt('created_at', cutoff)

  // Published rows first (visible today); id keeps the order stable for offset.
  const { data: rows, error: fetchErr } = await supabase
    .from('videos')
    .select('id, source_url')
    .is('video_path', null)
    .not('source_url', 'is', null)
    .lt('created_at', cutoff)
    .order('is_published', { ascending: false })
    .order('id')
    .range(offset, offset + batchSize - 1)

  if (fetchErr || !rows) {
    throw createError({
      statusCode: 500,
      message: `Failed to fetch videos: ${fetchErr?.message}`
    })
  }

  const processed: string[] = []
  const errors: { id: string; error: string }[] = []

  for (const [i, video] of rows.entries()) {
    // tikwm is a free endpoint — don't hammer it
    if (i > 0) await new Promise((r) => setTimeout(r, 1000))

    try {
      const stored = await downloadAndStoreTikTok(video.source_url!, supabase)

      const update: { video_path: string; duration_seconds?: number } = { video_path: stored.videoPath }
      if (stored.durationSeconds) update.duration_seconds = stored.durationSeconds

      const { error: updateErr } = await supabase
        .from('videos')
        .update(update)
        .eq('id', video.id)

      if (updateErr) {
        await stored.remove()
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
