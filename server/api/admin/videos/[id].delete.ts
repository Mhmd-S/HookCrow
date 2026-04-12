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

  // Delete the video record (segments cascade automatically)
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
