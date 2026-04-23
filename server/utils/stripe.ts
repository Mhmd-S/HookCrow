import Stripe from 'stripe'
import type { SubscriptionPlan, SubscriptionStatus } from '~/types'

const log = createLogger('stripe')

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

export async function syncSubscription(
  sub: Stripe.Subscription,
  knownProfileId?: string
): Promise<SyncSubscriptionResult | null> {
  const supabase = useServerSupabase()
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  let profile: { id: string, email: string, subscription_status: SubscriptionStatus, cancel_at_period_end: boolean } | null = null

  // Preferred path: caller already identified the profile (e.g., sync-session
  // verified ownership via client_reference_id). Skip the customer lookup.
  if (knownProfileId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, subscription_status, cancel_at_period_end')
      .eq('id', knownProfileId)
      .single()
    if (data) profile = data
  }

  // Webhook path: match the profile by stripe_customer_id.
  if (!profile) {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, subscription_status, cancel_at_period_end')
      .eq('stripe_customer_id', customerId)
      .single()
    if (data) profile = data
  }

  // Fallback: the subscription carries the profile id in metadata (set by
  // the checkout endpoint). Covers the case where stripe_customer_id wasn't
  // persisted on the profile — we link the customer back now, so future
  // webhook events resolve by customer id on the first lookup.
  if (!profile) {
    const metadataProfileId = typeof sub.metadata?.profile_id === 'string' ? sub.metadata.profile_id : null
    if (metadataProfileId) {
      const { data: byId } = await supabase
        .from('profiles')
        .select('id, email, subscription_status, cancel_at_period_end')
        .eq('id', metadataProfileId)
        .single()
      if (byId) profile = byId
    }
  }

  if (!profile) {
    log.warn('syncSubscription could not resolve profile', {
      subscriptionId: sub.id,
      customerId,
      metadataProfileId: sub.metadata?.profile_id ?? null,
      knownProfileId: knownProfileId ?? null
    })
    return null
  }

  // Ensure the profile is linked to the Stripe customer for future lookups.
  const { data: currentLink } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', profile.id)
    .single()
  if (currentLink?.stripe_customer_id !== customerId) {
    const { error: linkErr } = await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', profile.id)
    if (linkErr) {
      log.warn('Failed to link stripe_customer_id in syncSubscription', { profileId: profile.id, customerId, error: linkErr.message })
    }
  }

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
