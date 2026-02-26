export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('videos')
    .select('id, title, creator_handle, platform, video_path, duration_seconds, logic_flow_id, semantic_tags, status, is_published, created_at, updated_at, logic_flow:logic_flows(id, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  return { data: data || [] }
})
