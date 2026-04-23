import type Stripe from 'stripe'
import { syncSubscription } from '~~/server/utils/stripe'

const log = createLogger('stripe-sync-session')

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

  const stripe = useServerStripe()
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
  } catch (err) {
    log.warn('Failed to retrieve checkout session', { error: (err as Error).message, sessionId })
    throw createError({ statusCode: 404, message: 'Checkout session not found' })
  }

  const sessionCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
  const ownedByReference = session.client_reference_id === profile.id
  const ownedByCustomer = !!profile.stripe_customer_id && sessionCustomerId === profile.stripe_customer_id

  if (!ownedByReference && !ownedByCustomer) {
    log.warn('Session ownership check failed', {
      profileId: profile.id,
      sessionId,
      sessionCustomerId,
      profileCustomerId: profile.stripe_customer_id
    })
    throw createError({ statusCode: 403, message: 'Session does not belong to this user' })
  }

  const subscriptionField = session.subscription
  let subscription: Stripe.Subscription | null = null
  if (subscriptionField && typeof subscriptionField !== 'string') {
    subscription = subscriptionField
  } else if (typeof subscriptionField === 'string') {
    subscription = await stripe.subscriptions.retrieve(subscriptionField)
  }

  if (!subscription) {
    return { success: false, reason: 'no_subscription' as const }
  }

  // Pass the verified profile id so syncSubscription skips the customer-id
  // lookup entirely. Ownership was already confirmed above via client_reference_id
  // or stripe_customer_id match.
  const result = await syncSubscription(subscription, profile.id)
  if (!result) {
    log.warn('Subscription customer not mapped to any profile', { profileId: profile.id, sessionId })
    return { success: false, reason: 'no_profile_match' as const }
  }

  log.info('Synced subscription via session fallback', { ...result, sessionId })
  return { success: true, status: result.status }
})
