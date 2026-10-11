export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { success: true }
  }

  const supabase = useServerSupabase()
  const token = authHeader.slice(7)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (user) {
    // 'local' ends only this session. The default ('global') would also sign the user
    // out of every other app that shares this Supabase project's login pool.
    await supabase.auth.admin.signOut(token, 'local')
  }

  return { success: true }
})
