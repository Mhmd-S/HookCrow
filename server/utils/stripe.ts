import Stripe from 'stripe'

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
