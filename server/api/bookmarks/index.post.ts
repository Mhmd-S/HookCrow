export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ videoId?: string }>(event)
  const videoId = validateUUID(body?.videoId, 'videoId')

  const supabase = useServerSupabase()

  const { data: video, error: videoError } = await supabase
    .from('videos')
    .select('id, is_published')
    .eq('id', videoId)
    .single()

  if (videoError || !video || (!video.is_published && user.role !== 'admin')) {
    throw createError({ statusCode: 404, message: 'Recipe not found' })
  }

  const { error } = await supabase
    .from('bookmarks')
    .upsert({ user_id: user.id, video_id: videoId }, { onConflict: 'user_id,video_id' })

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  return { success: true }
})
