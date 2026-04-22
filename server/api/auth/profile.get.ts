export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, message: 'Failed to load profile' })
  }

  if (data) {
    return { data }
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(user.id)
  if (authError || !authUser?.user?.email) {
    throw createError({ statusCode: 404, message: 'Profile not found' })
  }

  const email = authUser.user.email
  const displayName = (authUser.user.user_metadata?.display_name as string | undefined) || email.split('@')[0]

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: user.id, email, display_name: displayName, role: 'user' })
    .select()
    .single()

  if (insertError || !created) {
    throw createError({ statusCode: 500, message: 'Failed to create profile' })
  }

  return { data: created }
})
