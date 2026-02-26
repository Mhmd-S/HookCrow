export default defineEventHandler(async (event) => {
  const id = validateUUID(getRouterParam(event, 'id'))
  const supabase = useServerSupabase()
  const user = await getServerUser(event)

  const { data, error } = await supabase
    .from('videos')
    .select('*, logic_flow:logic_flows(*), segments(*)')
    .eq('id', id)
    .order('segment_order', { referencedTable: 'segments' })
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, message: 'Recipe not found' })
  }

  // Access check: published OR owner OR admin
  const isOwner = user && data.user_id === user.id
  const isAdmin = user?.role === 'admin'
  if (!data.is_published && !isOwner && !isAdmin) {
    throw createError({ statusCode: 404, message: 'Recipe not found' })
  }

  return { data }
})
