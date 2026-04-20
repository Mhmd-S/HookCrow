export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = validateUUID(getRouterParam(event, 'id'), 'video id')

  const supabase = useServerSupabase()

  // First check if video exists
  const { data: existing } = await supabase
    .from('videos')
    .select('id, video_path')
    .eq('id', id)
    .single()

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Video not found'
    })
  }

  // Explicitly clean up dependent rows. The schema declares ON DELETE CASCADE,
  // but some environments were provisioned before that constraint landed.
  const { error: segmentsErr } = await supabase
    .from('segments')
    .delete()
    .eq('video_id', id)

  if (segmentsErr) {
    throw createError({ statusCode: 500, message: segmentsErr.message })
  }

  await supabase.from('bookmarks').delete().eq('video_id', id)

  const { error } = await supabase
    .from('videos')
    .delete()
    .eq('id', id)

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  // Optionally delete the video file from storage
  if (existing.video_path) {
    await supabase.storage.from('videos').remove([existing.video_path])
  }

  return { success: true }
})
