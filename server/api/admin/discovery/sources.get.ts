export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('discovery_sources')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  return { data }
})
