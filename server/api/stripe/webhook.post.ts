import type Stripe from 'stripe'
import type { SubscriptionPlan, SubscriptionStatus } from '~/types'

const log = createLogger('stripe-webhook')

function mapSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return 'free'
  }
}

function extractPlanFromSubscription(sub: Stripe.Subscription): SubscriptionPlan | null {
  const item = sub.items.data[0]
  const interval = item?.price?.recurring?.interval
  if (interval === 'month') return 'monthly'
  if (interval === 'year') return 'annual'
  return null
}

async function syncSubscription(sub: Stripe.Subscription) {
  const supabase = useServerSupabase()
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!profile) {
    log.warn('Received subscription event for unknown customer', { customerId })
    return
  }

  const firstItem = sub.items.data[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined
  const periodEnd = firstItem?.current_period_end
  const currentPeriodEnd = typeof periodEnd === 'number'
    ? new Date(periodEnd * 1000).toISOString()
    : null

  await supabase
    .from('profiles')
    .update({
      subscription_status: mapSubscriptionStatus(sub.status),
      subscription_id: sub.id,
      current_period_end: currentPeriodEnd,
      plan: extractPlanFromSubscription(sub)
    })
    .eq('id', profile.id)

  log.info('Synced subscription', {
    profileId: profile.id,
    status: sub.status,
    subscriptionId: sub.id
  })
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const secret = config.stripeWebhookSecret as string
  if (!secret) {
    throw createError({ statusCode: 500, message: 'STRIPE_WEBHOOK_SECRET not configured' })
  }

  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw createError({ statusCode: 400, message: 'Missing stripe-signature header' })
  }

  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) {
    throw createError({ statusCode: 400, message: 'Empty request body' })
  }

  const stripe = useServerStripe()
  let evt: Stripe.Event
  try {
    evt = await stripe.webhooks.constructEventAsync(rawBody, signature, secret)
  } catch (err) {
    log.warn('Signature verification failed', { error: (err as Error).message })
    throw createError({ statusCode: 400, message: 'Invalid signature' })
  }

  try {
    switch (evt.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(evt.data.object as Stripe.Subscription)
        break
      case 'checkout.session.completed': {
        const session = evt.data.object as Stripe.Checkout.Session
        if (session.subscription && typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription)
          await syncSubscription(sub)
        }
        break
      }
      default:
        log.info('Ignored webhook event', { type: evt.type })
    }
  } catch (err) {
    log.error('Webhook handler failed', err as Error, { type: evt.type })
    throw createError({ statusCode: 500, message: 'Webhook handler error' })
  }

  return { received: true }
})
