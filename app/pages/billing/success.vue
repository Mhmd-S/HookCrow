<script setup lang="ts">
useSeoMeta({
  title: 'Subscription activated',
  robots: 'noindex,nofollow'
})

const route = useRoute()
const { profile, refreshProfile, isPro, authHeaders } = useAuth()

const activated = ref(false)
const checking = ref(true)
let attempts = 0
const maxAttempts = 20

interface SyncResponse {
  success: boolean
  status?: string
  reason?: string
}

async function poll() {
  attempts += 1
  await refreshProfile()
  if (isPro.value || attempts >= maxAttempts) {
    activated.value = isPro.value
    checking.value = false
    return
  }
  setTimeout(poll, 1500)
}

async function trySyncFromSession(): Promise<SyncResponse | null> {
  const sessionId = route.query.session_id
  if (typeof sessionId !== 'string' || !sessionId) return null
  try {
    return await $fetch<SyncResponse>('/api/stripe/sync-session', {
      method: 'POST',
      body: { sessionId },
      headers: authHeaders()
    })
  } catch (err: any) {
    console.error('[billing/success] sync-session failed', err?.data?.message || err?.message || err)
    return null
  }
}

const showSuccess = computed(() => activated.value || isPro.value)

onMounted(async () => {
  const syncResult = await trySyncFromSession()

  if (syncResult?.success && syncResult.status === 'active') {
    if (profile.value) {
      profile.value = { ...profile.value, subscription_status: 'active' }
    }
    activated.value = true
    checking.value = false
    refreshProfile()
    return
  }

  await refreshProfile()
  if (isPro.value) {
    activated.value = true
    checking.value = false
    return
  }
  poll()
})
</script>

<template>
  <div class="max-w-xl mx-auto px-4 md:px-6 py-16 md:py-24 text-center">
    <div v-if="checking && !showSuccess" class="space-y-4">
      <UIcon name="i-ph-circle-notch" class="w-10 h-10 text-primary animate-spin mx-auto" />
      <h1 class="text-xl font-semibold">Activating your Pro subscription…</h1>
      <p class="text-muted text-sm">This usually takes a few seconds while Stripe confirms the payment.</p>
    </div>

    <div v-else-if="showSuccess" class="space-y-4">
      <UIcon name="i-ph-crown-simple-fill" class="w-12 h-12 text-primary mx-auto" />
      <h1 class="text-2xl font-bold">Welcome to Pro</h1>
      <p class="text-muted">You now have full access to every premium recipe.</p>
      <div class="flex flex-wrap gap-2 justify-center pt-2">
        <UButton to="/" size="lg">Browse recipes</UButton>
        <UButton to="/account" variant="soft" size="lg">Manage subscription</UButton>
      </div>
    </div>

    <div v-else class="space-y-4">
      <UIcon name="i-ph-warning" class="w-10 h-10 text-warning mx-auto" />
      <h1 class="text-xl font-semibold">We couldn't confirm your subscription yet</h1>
      <p class="text-muted text-sm">Stripe may still be processing. Refresh in a minute, or head to your account to check the status.</p>
      <UButton to="/account" variant="soft">Go to account</UButton>
    </div>
  </div>
</template>
