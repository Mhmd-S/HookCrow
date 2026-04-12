export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('bookmarks')
    .select('created_at, video:videos(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  const videos = (data || [])
    .map(row => row.video)
    .filter((v): v is NonNullable<typeof v> => v !== null)

  return { data: videos }
})
