import type Stripe from 'stripe'
import { syncSubscription } from '~~/server/utils/stripe'

const log = createLogger('stripe-webhook')

async function handleSubscriptionEvent(sub: Stripe.Subscription) {
  const result = await syncSubscription(sub)
  if (!result) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    log.warn('Received subscription event for unknown customer', { customerId })
    return
  }
  log.info('Synced subscription', { ...result })
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
        await handleSubscriptionEvent(evt.data.object as Stripe.Subscription)
        break
      case 'checkout.session.completed': {
        const session = evt.data.object as Stripe.Checkout.Session
        if (session.subscription && typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription)
          await handleSubscriptionEvent(sub)
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
