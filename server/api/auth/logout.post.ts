export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { success: true }
  }

  const supabase = useServerSupabase()
  const token = authHeader.slice(7)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (user) {
    await supabase.auth.admin.signOut(token)
  }

  return { success: true }
})
