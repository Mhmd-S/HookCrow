export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = validateUUID(getRouterParam(event, 'id'), 'video id')

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('videos')
    .select(`
      *,
      logic_flow:logic_flows(*),
      segments(*)
    `)
    .eq('id', id)
    .order('segment_order', { referencedTable: 'segments' })
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw createError({
        statusCode: 404,
        message: 'Video not found'
      })
    }
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
