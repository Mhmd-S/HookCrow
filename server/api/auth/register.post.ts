export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password, displayName } = body

  if (!email || !password) {
    throw createError({ statusCode: 400, message: 'Email and password are required' })
  }

  const supabase = useServerSupabase()
console.log("Creating user with email:", supabase.auth.admin)
const { data: dataA, error: errorR } = await supabase.auth.admin.listUsers();
  console.log("Existing users:", dataA, "Error:", errorR)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName }
  })

  if (error) {
    throw createError({ statusCode: 400, message: error.message })
  }

  // Create profile directly (no trigger dependency)
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: data.user.id,
      email,
      display_name: displayName || email.split('@')[0],
      role: 'user'
    })

  if (profileError) {
    // Clean up the auth user if profile creation fails
    await supabase.auth.admin.deleteUser(data.user.id)
    throw createError({ statusCode: 500, message: 'Failed to create user profile' })
  }

  // Sign in immediately to get a session
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (signInError) {
    throw createError({ statusCode: 500, message: 'Account created but sign-in failed' })
  }

  return {
    data: {
      user: data.user,
      session: session.session
    }
  }
})
