import Stripe from 'stripe'
import type { SubscriptionPlan, SubscriptionStatus } from '~/types'

let client: Stripe | null = null

export function useServerStripe(): Stripe {
  if (!client) {
    const config = useRuntimeConfig()
    const key = config.stripeSecretKey as string
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    client = new Stripe(key, { apiVersion: '2025-09-30.clover' })
  }
  return client
}

export interface StripePriceIds {
  monthly: string
  annual: string
}

export function getStripePriceIds(): StripePriceIds {
  const config = useRuntimeConfig()
  return {
    monthly: (config.stripePriceIdMonthly as string) || '',
    annual: (config.stripePriceIdAnnual as string) || ''
  }
}

export function getSiteUrl(): string {
  const config = useRuntimeConfig()
  return (config.public.siteUrl as string) || 'http://localhost:3000'
}

export function mapSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
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

export function extractPlanFromSubscription(sub: Stripe.Subscription): SubscriptionPlan | null {
  const item = sub.items.data[0]
  const interval = item?.price?.recurring?.interval
  if (interval === 'month') return 'monthly'
  if (interval === 'year') return 'annual'
  return null
}

export interface SyncSubscriptionResult {
  profileId: string
  email: string
  status: SubscriptionStatus
  previousStatus: SubscriptionStatus
  subscriptionId: string
  plan: SubscriptionPlan | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  previousCancelAtPeriodEnd: boolean
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<SyncSubscriptionResult | null> {
  const supabase = useServerSupabase()
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, subscription_status, cancel_at_period_end')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!profile) return null

  const firstItem = sub.items.data[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined
  const periodEnd = firstItem?.current_period_end
  const currentPeriodEnd = typeof periodEnd === 'number'
    ? new Date(periodEnd * 1000).toISOString()
    : null

  const status = mapSubscriptionStatus(sub.status)
  const plan = extractPlanFromSubscription(sub)
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end)

  await supabase
    .from('profiles')
    .update({
      subscription_status: status,
      subscription_id: sub.id,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      plan
    })
    .eq('id', profile.id)

  return {
    profileId: profile.id,
    email: profile.email,
    status,
    previousStatus: profile.subscription_status,
    subscriptionId: sub.id,
    plan,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    previousCancelAtPeriodEnd: profile.cancel_at_period_end
  }
}
