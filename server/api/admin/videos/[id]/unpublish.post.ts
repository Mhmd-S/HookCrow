export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = validateUUID(getRouterParam(event, 'id'), 'video id')
  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('videos')
    .update({ is_published: false })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, message: 'Video not found' })
  }

  return { data }
})
