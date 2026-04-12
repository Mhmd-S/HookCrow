export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  return { data }
})
