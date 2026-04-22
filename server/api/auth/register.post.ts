export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password, displayName } = body

  if (!email || !password) {
    throw createError({ statusCode: 400, message: 'Email and password are required' })
  }

  const siteUrl = getRequestSiteUrl(event)

  const authClient = createServerSupabase()
  const { data, error } = await authClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: { display_name: displayName }
    }
  })

  if (error) {
    throw createError({ statusCode: 400, message: error.message })
  }

  if (!data.user) {
    throw createError({ statusCode: 500, message: 'Sign-up failed' })
  }

  // Supabase returns an obfuscated user (empty identities) when the email is
  // already registered — don't touch the profile in that case.
  const isFreshSignup = Array.isArray(data.user.identities) && data.user.identities.length > 0

  if (isFreshSignup) {
    const supabase = useServerSupabase()
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        email,
        display_name: displayName || email.split('@')[0],
        role: 'user'
      }, { onConflict: 'id', ignoreDuplicates: true })

    if (profileError) {
      await supabase.auth.admin.deleteUser(data.user.id)
      throw createError({ statusCode: 500, message: 'Failed to create user profile' })
    }
  }

  return {
    data: {
      user: data.user,
      session: data.session,
      needsConfirmation: !data.session
    }
  }
})
