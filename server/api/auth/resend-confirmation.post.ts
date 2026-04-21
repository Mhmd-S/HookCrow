export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email } = body

  if (!email) {
    throw createError({ statusCode: 400, message: 'Email is required' })
  }

  const config = useRuntimeConfig()
  const siteUrl = (config.public.siteUrl as string) || 'http://localhost:3000'

  const supabase = createServerSupabase()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` }
  })

  if (error) {
    throw createError({ statusCode: 400, message: error.message })
  }

  return { success: true }
})
