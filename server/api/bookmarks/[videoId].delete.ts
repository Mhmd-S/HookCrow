export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const videoId = validateUUID(getRouterParam(event, 'videoId'), 'videoId')

  const supabase = useServerSupabase()

  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('user_id', user.id)
    .eq('video_id', videoId)

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  return { success: true }
})
