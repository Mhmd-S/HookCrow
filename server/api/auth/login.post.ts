export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password } = body

  if (!email || !password) {
    throw createError({ statusCode: 400, message: 'Email and password are required' })
  }

  const supabase = useServerSupabase()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    throw createError({ statusCode: 401, message: error.message })
  }

  return {
    data: {
      user: data.user,
      session: data.session
    }
  }
})
