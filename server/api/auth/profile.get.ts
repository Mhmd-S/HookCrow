export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, message: 'Profile not found' })
  }

  return { data }
})
