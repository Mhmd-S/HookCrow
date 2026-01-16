export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const videoId = validateUUID(query.videoId as string, 'videoId')

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('segments')
    .select('*')
    .eq('video_id', videoId)
    .order('segment_order')

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
