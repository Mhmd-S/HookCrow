export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const stripe = useServerStripe()
  const supabase = useServerSupabase()

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    throw createError({ statusCode: 400, message: 'No Stripe customer on file — subscribe first' })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${getSiteUrl()}/account`
  })

  return { url: session.url }
})
