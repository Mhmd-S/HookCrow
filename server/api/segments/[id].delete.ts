export default defineEventHandler(async (event) => {
  const id = validateUUID(getRouterParam(event, 'id'), 'segment id')

  const supabase = useServerSupabase()

  // Check if segment exists first
  const { data: existing } = await supabase
    .from('segments')
    .select('id')
    .eq('id', id)
    .single()

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Segment not found'
    })
  }

  const { error } = await supabase
    .from('segments')
    .delete()
    .eq('id', id)

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { success: true }
})
