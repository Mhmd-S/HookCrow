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

// ---------------------------------------------------------------------------
// Subscription sync
// ---------------------------------------------------------------------------

function mapStatus(raw: string): SubscriptionStatus {
  switch (raw) {
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

function mapPlan(interval: string | null | undefined): SubscriptionPlan | null {
  if (interval === 'month') return 'monthly'
  if (interval === 'year') return 'annual'
  return null
}

export interface SubscriptionSyncInput {
  subscriptionId: string
  customerId: string
  statusRaw: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  interval: string | null
  metadataProfileId: string | null
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

interface ProfileRow {
  id: string
  email: string
  subscription_status: SubscriptionStatus
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
}

// Resolution order:
//   1. knownProfileId — caller verified ownership out-of-band (sync-session
//      matches the JWT subject against the Checkout Session's
//      client_reference_id before calling).
//   2. metadata.profile_id — /api/billing/checkout writes the profile id into
//      subscription_data.metadata. This IS the primary contract for any
//      subscription created by our own flow; trust it.
//   3. stripe_customer_id — recovery path for subs NOT created by our
//      checkout (imports, manual Stripe-dashboard creation).
async function resolveProfile(
  supabase: ReturnType<typeof useServerSupabase>,
  input: SubscriptionSyncInput,
  knownProfileId: string | undefined
): Promise<{ profile: ProfileRow | null, error: Error | null }> {
  const candidateId = knownProfileId ?? input.metadataProfileId
  if (candidateId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, subscription_status, cancel_at_period_end, stripe_customer_id')
      .eq('id', candidateId)
      .maybeSingle<ProfileRow>()
    if (error) {
      return { profile: null, error: new Error(`profiles select by id failed: ${error.message}`) }
    }
    if (data) return { profile: data, error: null }
    // Fall through to customer-id recovery if the id candidate matched
    // nothing — profile may have been deleted, or metadata may be stale.
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, subscription_status, cancel_at_period_end, stripe_customer_id')
    .eq('stripe_customer_id', input.customerId)
    .maybeSingle<ProfileRow>()
  if (error) {
    return { profile: null, error: new Error(`profiles select by stripe_customer_id failed: ${error.message}`) }
  }
  return { profile: data ?? null, error: null }
}

export async function syncSubscriptionFromFields(
  input: SubscriptionSyncInput,
  knownProfileId?: string
): Promise<SyncSubscriptionResult | null> {
  const supabase = useServerSupabase()

  const { profile, error: resolveErr } = await resolveProfile(supabase, input, knownProfileId)
  if (resolveErr) {
    log.error('Profile resolution failed', resolveErr, {
      subscriptionId: input.subscriptionId,
      customerId: input.customerId,
      metadataProfileId: input.metadataProfileId,
      knownProfileId: knownProfileId ?? null
    })
    return null
  }
  if (!profile) {
    // Every resolution path produced zero rows. Log enough context to
    // tell apart "profile was deleted", "metadata carries a stale id", and
    // "subscription wasn't created by our checkout."
    log.error('Could not resolve profile for Stripe subscription', undefined, {
      subscriptionId: input.subscriptionId,
      customerId: input.customerId,
      metadataProfileId: input.metadataProfileId,
      knownProfileId: knownProfileId ?? null
    })
    return null
  }

  const status = mapStatus(input.statusRaw)
  const plan = mapPlan(input.interval)
  const cancelAtPeriodEnd = Boolean(input.cancelAtPeriodEnd)

  // Single UPDATE covers the customer link + the full subscription state.
  // Re-writing stripe_customer_id to its current value is a no-op, so this
  // stays safe on repeat syncs.
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({
      stripe_customer_id: input.customerId,
      subscription_id: input.subscriptionId,
      subscription_status: status,
      current_period_end: input.currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      plan
    })
    .eq('id', profile.id)

  if (updateErr) {
    log.error('profiles update failed', new Error(updateErr.message), {
      profileId: profile.id,
      subscriptionId: input.subscriptionId
    })
    return null
  }

  return {
    profileId: profile.id,
    email: profile.email,
    status,
    previousStatus: profile.subscription_status,
    subscriptionId: input.subscriptionId,
    plan,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd,
    previousCancelAtPeriodEnd: profile.cancel_at_period_end
  }
}

export async function syncSubscription(
  sub: Stripe.Subscription,
  knownProfileId?: string
): Promise<SyncSubscriptionResult | null> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const firstItem = sub.items.data[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined
  const periodEnd = firstItem?.current_period_end
  const currentPeriodEnd = typeof periodEnd === 'number'
    ? new Date(periodEnd * 1000).toISOString()
    : null

  return syncSubscriptionFromFields({
    subscriptionId: sub.id,
    customerId,
    statusRaw: sub.status,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    currentPeriodEnd,
    interval: firstItem?.price?.recurring?.interval ?? null,
    metadataProfileId: typeof sub.metadata?.profile_id === 'string' ? sub.metadata.profile_id : null
  }, knownProfileId)
}
