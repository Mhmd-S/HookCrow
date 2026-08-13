export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = validateUUID(getRouterParam(event, 'id'), 'discovery source id')

  const supabase = useServerSupabase()

  const { data: existing } = await supabase
    .from('discovery_sources')
    .select('id')
    .eq('id', id)
    .single()

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Discovery source not found' })
  }

  const { error } = await supabase
    .from('discovery_sources')
    .delete()
    .eq('id', id)

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  return { success: true }
})
