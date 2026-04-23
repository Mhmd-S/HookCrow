import type Stripe from 'stripe'
import { syncSubscription } from '~~/server/utils/stripe'
import { sendSubscriptionConfirmationEmail, sendSubscriptionCancellationEmail } from '~~/server/utils/email'

const log = createLogger('stripe-webhook')

async function handleSubscriptionEvent(sub: Stripe.Subscription, eventType: Stripe.Event['type']) {
  const result = await syncSubscription(sub)
  if (!result) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    log.warn('Received subscription event for unknown customer', { customerId })
    return
  }
  log.info('Synced subscription', {
    profileId: result.profileId,
    status: result.status,
    previousStatus: result.previousStatus,
    cancelAtPeriodEnd: result.cancelAtPeriodEnd,
    eventType
  })

  // Initial subscription → confirmation email. Stripe fires
  // customer.subscription.created exactly once per subscription, so no dedupe needed.
  if (eventType === 'customer.subscription.created' && result.status === 'active') {
    await sendSubscriptionConfirmationEmail({
      email: result.email,
      plan: result.plan,
      periodEnd: result.currentPeriodEnd
    })
  }

  // User scheduled a cancellation → send on the false→true transition so renewals
  // or other unrelated subscription updates don't retrigger it.
  if (
    eventType === 'customer.subscription.updated'
    && result.cancelAtPeriodEnd
    && !result.previousCancelAtPeriodEnd
  ) {
    await sendSubscriptionCancellationEmail({
      email: result.email,
      plan: result.plan,
      periodEnd: result.currentPeriodEnd
    })
  }
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
        await handleSubscriptionEvent(evt.data.object as Stripe.Subscription, evt.type)
        break
      case 'checkout.session.completed': {
        const session = evt.data.object as Stripe.Checkout.Session
        if (session.subscription && typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription)
          await handleSubscriptionEvent(sub, evt.type)
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
