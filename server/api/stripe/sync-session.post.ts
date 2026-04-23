import { syncSubscriptionFromFields } from '~~/server/utils/stripe'

const log = createLogger('stripe-sync-session')

interface WrapperCheckoutSession {
  id: string
  customer: string | null
  client_reference_id: string | null
  subscription: string | null
  payment_status: string | null
}

interface WrapperSubscription {
  id: string
  customer: string
  current_period_end: string | null
  status: string
  cancel_at_period_end: boolean | null
  interval: string | null
  metadata_profile_id: string | null
}

export default defineEventHandler(async (event) => {
  const authedUser = await requireAuth(event)
  const body = await readBody<{ sessionId?: string }>(event)
  const sessionId = validateString(body?.sessionId, 'sessionId', { minLength: 1, maxLength: 200 })

  const supabase = useServerSupabase()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, stripe_customer_id')
    .eq('id', authedUser.id)
    .single()

  if (!profile) {
    throw createError({ statusCode: 404, message: 'Profile not found' })
  }

  // Read the Checkout Session via the Stripe Wrapper (see
  // supabase/migrations/010_stripe_wrapper.sql). Every SELECT here is a live
  // Stripe API call translated from the WHERE clause.
  const { data: session, error: sessionErr } = await supabase
    .from('v_stripe_checkout_sessions')
    .select('id, customer, client_reference_id, subscription, payment_status')
    .eq('id', sessionId)
    .maybeSingle<WrapperCheckoutSession>()

  if (sessionErr || !session) {
    log.warn('Failed to read checkout session from wrapper', { error: sessionErr?.message, sessionId })
    throw createError({ statusCode: 404, message: 'Checkout session not found' })
  }

  const ownedByReference = session.client_reference_id === profile.id
  const ownedByCustomer = !!profile.stripe_customer_id && session.customer === profile.stripe_customer_id

  if (!ownedByReference && !ownedByCustomer) {
    log.warn('Session ownership check failed', {
      profileId: profile.id,
      sessionId,
      sessionCustomerId: session.customer,
      profileCustomerId: profile.stripe_customer_id
    })
    throw createError({ statusCode: 403, message: 'Session does not belong to this user' })
  }

  if (!session.subscription) {
    return { success: false, reason: 'no_subscription' as const }
  }

  const { data: sub, error: subErr } = await supabase
    .from('v_stripe_subscriptions')
    .select('id, customer, current_period_end, status, cancel_at_period_end, interval, metadata_profile_id')
    .eq('id', session.subscription)
    .maybeSingle<WrapperSubscription>()

  if (subErr || !sub) {
    log.warn('Failed to read subscription from wrapper', { error: subErr?.message, subscriptionId: session.subscription })
    return { success: false, reason: 'no_subscription' as const }
  }

  const result = await syncSubscriptionFromFields({
    subscriptionId: sub.id,
    customerId: sub.customer,
    statusRaw: sub.status,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    currentPeriodEnd: sub.current_period_end,
    interval: sub.interval,
    metadataProfileId: sub.metadata_profile_id
  }, profile.id)

  if (!result) {
    log.warn('Subscription customer not mapped to any profile', { profileId: profile.id, sessionId })
    return { success: false, reason: 'no_profile_match' as const }
  }

  log.info('Synced subscription via session fallback', { ...result, sessionId })
  return { success: true, status: result.status }
})
