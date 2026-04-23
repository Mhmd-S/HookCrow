import type { SubscriptionPlan } from '~/types'

const PLANS: readonly SubscriptionPlan[] = ['monthly', 'annual'] as const

const log = createLogger('billing-checkout')

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ plan: SubscriptionPlan }>(event)
  const plan = validateEnum(body?.plan, 'plan', PLANS)

  const stripe = useServerStripe()
  const supabase = useServerSupabase()
  const { monthly, annual } = getStripePriceIds()
  const priceId = plan === 'monthly' ? monthly : annual
  if (!priceId) {
    throw createError({ statusCode: 500, message: `Stripe price for ${plan} plan not configured` })
  }

  // Load profile to find or attach a Stripe customer.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, display_name, stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    throw createError({ statusCode: 404, message: 'Profile not found' })
  }

  let customerId = profile.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      name: profile.display_name || undefined,
      metadata: { profile_id: profile.id }
    })
    customerId = customer.id
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', profile.id)
    if (updateErr) {
      log.warn('Failed to persist stripe_customer_id on profile', {
        profileId: profile.id,
        customerId,
        error: updateErr.message
      })
    }
  }

  const siteUrl = getSiteUrl()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/billing/cancel`,
    allow_promotion_codes: true,
    client_reference_id: profile.id,
    subscription_data: {
      metadata: { profile_id: profile.id, plan }
    },
    metadata: { profile_id: profile.id, plan }
  })

  return { url: session.url }
})
