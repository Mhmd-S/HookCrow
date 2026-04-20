<script setup lang="ts">
import type { SubscriptionPlan } from '~/types'

const { authHeaders, isPro } = useAuth()
const loading = ref<SubscriptionPlan | null>(null)
const error = ref<string | null>(null)

async function subscribe(plan: SubscriptionPlan) {
  loading.value = plan
  error.value = null
  try {
    const { url } = await $fetch<{ url: string | null }>('/api/billing/checkout', {
      method: 'POST',
      body: { plan },
      headers: authHeaders()
    })
    if (url) {
      window.location.href = url
    } else {
      error.value = 'Could not start checkout session'
    }
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Checkout failed'
  } finally {
    loading.value = null
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 md:px-6 py-10 md:py-16">
    <div class="text-center mb-12">
      <p class="text-xs font-semibold uppercase tracking-wider text-primary">Pricing</p>
      <h1 class="text-4xl font-bold mt-2">Go Pro to unlock every recipe</h1>
      <p class="text-muted mt-3 max-w-xl mx-auto">
        Free forever for our public library. Upgrade to Pro to unlock the full breakdowns — script blueprints, skeletal logic, and every premium recipe.
      </p>
    </div>

    <UAlert v-if="error" color="error" :title="error" class="mb-6" />

    <div v-if="isPro" class="bg-primary/5 border border-primary/30 rounded-2xl p-6 text-center">
      <UIcon name="i-ph-crown-simple-fill" class="w-8 h-8 text-primary mx-auto" />
      <p class="mt-3 font-semibold">You're already on Pro. Manage your plan from your account.</p>
      <UButton to="/account" class="mt-4" variant="soft">Account</UButton>
    </div>

    <div v-else class="grid md:grid-cols-2 gap-4 md:gap-6">
      <!-- Monthly -->
      <div class="bg-default border border-default rounded-2xl p-8 flex flex-col gap-6">
        <div>
          <h2 class="text-lg font-semibold">Monthly</h2>
          <p class="text-sm text-muted mt-1">Flexible month-to-month access. Cancel anytime.</p>
        </div>
        <div>
          <span class="text-4xl font-bold">$14.99</span>
          <span class="text-muted ml-1">/month</span>
          <p class="text-xs text-dimmed mt-1">Billed every month</p>
        </div>
        <ul class="space-y-2 text-sm flex-1">
          <li class="flex items-start gap-2">
            <UIcon name="i-ph-check-circle-fill" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>All premium recipes</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-ph-check-circle-fill" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>Full breakdowns + skeletal logic</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-ph-check-circle-fill" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>Cancel anytime via Stripe</span>
          </li>
        </ul>
        <UButton
          block
          size="lg"
          :loading="loading === 'monthly'"
          :disabled="!!loading"
          @click="subscribe('monthly')"
        >
          Subscribe monthly
        </UButton>
      </div>

      <!-- Annual -->
      <div class="bg-default border-2 border-primary rounded-2xl p-8 flex flex-col gap-6 relative">
        <span class="absolute -top-3 right-6 bg-primary text-inverted text-xs font-semibold px-3 py-1 rounded-full">
          Best value
        </span>
        <div>
          <h2 class="text-lg font-semibold">Annual</h2>
          <p class="text-sm text-muted mt-1">Save vs. monthly. One charge, full year of access.</p>
        </div>
        <div>
          <span class="text-4xl font-bold">$129.99</span>
          <span class="text-muted ml-1">/year</span>
          <p class="text-xs text-dimmed mt-1">Billed yearly · ~$10.83/month</p>
        </div>
        <ul class="space-y-2 text-sm flex-1">
          <li class="flex items-start gap-2">
            <UIcon name="i-ph-check-circle-fill" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>Everything in monthly</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-ph-check-circle-fill" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>Lower per-month price</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-ph-check-circle-fill" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>Priority access to new recipes</span>
          </li>
        </ul>
        <UButton
          block
          size="lg"
          :loading="loading === 'annual'"
          :disabled="!!loading"
          @click="subscribe('annual')"
        >
          Subscribe annually
        </UButton>
      </div>
    </div>

    <p class="text-xs text-dimmed text-center mt-10">
      Secure payment by Stripe. You can manage or cancel your subscription at any time from the account page.
    </p>
  </div>
</template>
