<script setup lang="ts">
import type { SubscriptionPlan, SubscriptionStatus } from '~/types'

const { profile, authHeaders, logout } = useAuth()
const router = useRouter()

interface BillingStatus {
  subscription_status: SubscriptionStatus
  plan: SubscriptionPlan | null
  current_period_end: string | null
  is_pro: boolean
  has_customer: boolean
}

const status = ref<BillingStatus | null>(null)
const loading = ref(true)
const actionLoading = ref(false)
const error = ref<string | null>(null)

async function loadStatus() {
  loading.value = true
  try {
    const { data } = await $fetch<{ data: BillingStatus }>('/api/billing/status', {
      headers: authHeaders()
    })
    status.value = data
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to load subscription'
  } finally {
    loading.value = false
  }
}

async function openPortal() {
  actionLoading.value = true
  error.value = null
  try {
    const { url } = await $fetch<{ url: string }>('/api/billing/portal', {
      method: 'POST',
      headers: authHeaders()
    })
    if (url) window.location.href = url
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Could not open billing portal'
  } finally {
    actionLoading.value = false
  }
}

async function handleLogout() {
  await logout()
  router.push('/login')
}

function formatDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const statusLabel = computed(() => {
  const s = status.value?.subscription_status
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')
})

onMounted(loadStatus)
</script>

<template>
  <div class="max-w-2xl mx-auto px-6 py-10 space-y-8">
    <h1 class="text-2xl font-bold">Account</h1>

    <UAlert v-if="error" color="error" :title="error" />

    <!-- Profile -->
    <section class="bg-white border border-default rounded-2xl p-6 space-y-2">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-dimmed">Profile</h2>
      <p class="text-default">{{ profile?.display_name || '—' }}</p>
      <p class="text-sm text-muted">{{ profile?.email }}</p>
    </section>

    <!-- Subscription -->
    <section class="bg-white border border-default rounded-2xl p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-dimmed">Subscription</h2>
        <UBadge
          v-if="status"
          :color="status.is_pro ? 'success' : 'neutral'"
          variant="subtle"
          size="sm"
        >
          {{ statusLabel }}
        </UBadge>
      </div>

      <div v-if="loading" class="flex items-center gap-2 text-muted text-sm">
        <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin" />
        Loading…
      </div>

      <template v-else-if="status">
        <div v-if="status.is_pro" class="space-y-1 text-sm">
          <p class="text-default">
            You're on the <strong>{{ status.plan === 'annual' ? 'Annual' : 'Monthly' }}</strong> plan.
          </p>
          <p v-if="status.current_period_end" class="text-muted">
            Renews on {{ formatDate(status.current_period_end) }}.
          </p>
        </div>

        <div v-else class="text-sm text-muted">
          You're on the free plan. Upgrade to unlock every premium recipe.
        </div>

        <div class="flex flex-wrap gap-2 pt-2">
          <UButton
            v-if="status.has_customer"
            :loading="actionLoading"
            variant="soft"
            icon="i-ph-gear"
            @click="openPortal"
          >
            Manage subscription
          </UButton>
          <UButton v-else to="/pricing" icon="i-ph-crown-simple">
            Upgrade to Pro
          </UButton>
        </div>
      </template>
    </section>

    <!-- Sign out -->
    <section class="flex justify-end">
      <UButton variant="ghost" color="neutral" @click="handleLogout">Sign out</UButton>
    </section>
  </div>
</template>
