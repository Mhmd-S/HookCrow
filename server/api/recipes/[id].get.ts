export default defineEventHandler(async (event) => {
  const user = await getServerUser(event)
  const id = validateUUID(getRouterParam(event, 'id'))
  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('videos')
    .select('*, logic_flow:logic_flows(*), segments(*)')
    .eq('id', id)
    .order('segment_order', { referencedTable: 'segments' })
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, message: 'Recipe not found' })
  }

  const isAdmin = user?.role === 'admin'

  // Drafts: admin-only.
  if (!data.is_published && !isAdmin) {
    throw createError({ statusCode: 404, message: 'Recipe not found' })
  }

  // Published recipes are open to everyone, including anonymous visitors.
  // Bookmarks and other account-only actions are still gated client-side.
  return { data }
})
