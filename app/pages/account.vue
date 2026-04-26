<script setup lang="ts">
import type { SubscriptionPlan, SubscriptionStatus } from '~/types'

useSeoMeta({
  title: 'Account',
  robots: 'noindex,nofollow'
})

const { profile, authHeaders, logout, refreshProfile } = useAuth()
const router = useRouter()

interface BillingStatus {
  subscription_status: SubscriptionStatus
  plan: SubscriptionPlan | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  is_pro: boolean
  has_customer: boolean
}

interface Invoice {
  id: string
  status: string | null
  total: number | null
  currency: string | null
  created: string | null
  number: string | null
  hosted_invoice_url: string | null
  invoice_pdf: string | null
}

const status = ref<BillingStatus | null>(null)
const loading = ref(true)
const actionLoading = ref(false)
const error = ref<string | null>(null)

const invoices = ref<Invoice[]>([])
const invoicesLoading = ref(false)

async function loadStatus() {
  loading.value = true
  try {
    const { data } = await $fetch<{ data: BillingStatus }>('/api/billing/status', {
      headers: authHeaders()
    })
    status.value = data
    if (data.has_customer) loadInvoices()
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to load subscription'
  } finally {
    loading.value = false
  }
}

async function loadInvoices() {
  invoicesLoading.value = true
  try {
    const { data } = await $fetch<{ data: Invoice[] }>('/api/billing/invoices', {
      headers: authHeaders()
    })
    invoices.value = data
  } catch {
    // Non-fatal: account page still renders without history.
  } finally {
    invoicesLoading.value = false
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

function formatAmount(total: number | null, currency: string | null) {
  if (total == null || !currency) return ''
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(total / 100)
  } catch {
    return `${(total / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

function invoiceStatusColor(s: string | null): 'success' | 'neutral' | 'error' | 'warning' {
  if (s === 'paid') return 'success'
  if (s === 'uncollectible' || s === 'void') return 'error'
  if (s === 'open') return 'warning'
  return 'neutral'
}

function invoiceStatusLabel(s: string | null): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const statusLabel = computed(() => {
  const s = status.value?.subscription_status
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')
})

const planLabel = computed(() => {
  const p = status.value?.plan
  if (p === 'annual') return 'Annual'
  if (p === 'monthly') return 'Monthly'
  return 'Pro'
})

const editingName = ref(false)
const draftName = ref('')
const savingName = ref(false)
const nameError = ref<string | null>(null)

function startEditName() {
  draftName.value = profile.value?.display_name || ''
  nameError.value = null
  editingName.value = true
}

function cancelEditName() {
  editingName.value = false
  nameError.value = null
}

async function saveName() {
  const trimmed = draftName.value.trim()
  if (!trimmed) {
    nameError.value = 'Display name cannot be empty'
    return
  }
  savingName.value = true
  nameError.value = null
  try {
    await $fetch('/api/auth/profile', {
      method: 'PUT',
      body: { display_name: trimmed },
      headers: authHeaders()
    })
    await refreshProfile()
    editingName.value = false
  } catch (err: any) {
    nameError.value = err?.data?.message || err?.message || 'Failed to save'
  } finally {
    savingName.value = false
  }
}

onMounted(loadStatus)
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10 space-y-8">
    <h1 class="text-2xl font-bold">Account</h1>

    <UAlert v-if="error" color="error" :title="error" />

    <!-- Profile -->
    <section class="bg-default border border-default rounded-2xl p-6 space-y-3">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-dimmed">Profile</h2>

      <div v-if="editingName" class="space-y-2">
        <UInput
          v-model="draftName"
          placeholder="Display name"
          :disabled="savingName"
          autofocus
          @keydown.enter="saveName"
          @keydown.escape="cancelEditName"
        />
        <p v-if="nameError" class="text-xs text-error">{{ nameError }}</p>
        <div class="flex flex-wrap gap-2 pt-1">
          <UButton size="sm" :loading="savingName" @click="saveName">Save</UButton>
          <UButton size="sm" variant="ghost" :disabled="savingName" @click="cancelEditName">
            Cancel
          </UButton>
        </div>
      </div>

      <div v-else class="flex items-center gap-2">
        <p class="text-default">{{ profile?.display_name || '—' }}</p>
        <UButton
          variant="ghost"
          size="xs"
          icon="i-ph-pencil-simple"
          aria-label="Edit display name"
          @click="startEditName"
        />
      </div>

      <p class="text-sm text-muted">{{ profile?.email }}</p>
    </section>

    <!-- Subscription -->
    <section class="bg-default border border-default rounded-2xl p-6 space-y-4">
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
            You're on the <strong>{{ planLabel }}</strong> plan.
          </p>

          <template v-if="status.cancel_at_period_end">
            <p class="text-warning">
              Your {{ planLabel }} plan ends on {{ formatDate(status.current_period_end) }}.
            </p>
            <p class="text-muted">
              You'll keep access until then. Resume anytime from the billing portal.
            </p>
          </template>
          <p v-else-if="status.current_period_end" class="text-muted">
            Renews on {{ formatDate(status.current_period_end) }}.
          </p>
        </div>

        <div v-else-if="status.subscription_status === 'past_due'" class="space-y-1 text-sm">
          <p class="text-error">Payment failed.</p>
          <p class="text-muted">Update your card in the billing portal to keep your access.</p>
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

    <!-- Billing history -->
    <section
      v-if="status?.has_customer"
      class="bg-default border border-default rounded-2xl p-6 space-y-4"
    >
      <h2 class="text-sm font-semibold uppercase tracking-wider text-dimmed">Billing history</h2>

      <div v-if="invoicesLoading" class="flex items-center gap-2 text-muted text-sm">
        <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin" />
        Loading…
      </div>

      <p v-else-if="invoices.length === 0" class="text-sm text-muted">No invoices yet.</p>

      <ul v-else class="divide-y divide-default -mx-2">
        <li
          v-for="inv in invoices"
          :key="inv.id"
          class="flex items-center justify-between gap-3 px-2 py-3 text-sm"
        >
          <div class="min-w-0">
            <p class="text-default">{{ formatDate(inv.created) }}</p>
            <p v-if="inv.number" class="text-xs text-dimmed truncate">#{{ inv.number }}</p>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <span class="text-default tabular-nums">{{ formatAmount(inv.total, inv.currency) }}</span>
            <UBadge
              v-if="inv.status"
              :color="invoiceStatusColor(inv.status)"
              variant="subtle"
              size="sm"
            >
              {{ invoiceStatusLabel(inv.status) }}
            </UBadge>
            <UButton
              v-if="inv.hosted_invoice_url || inv.invoice_pdf"
              :to="inv.hosted_invoice_url || inv.invoice_pdf || undefined"
              target="_blank"
              rel="noopener"
              variant="ghost"
              size="xs"
              icon="i-ph-arrow-square-out"
              aria-label="View invoice"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- Sign out -->
    <section class="flex justify-end">
      <UButton variant="ghost" color="neutral" @click="handleLogout">Sign out</UButton>
    </section>
  </div>
</template>
