<script setup lang="ts">
useSeoMeta({
  title: 'Subscription activated',
  robots: 'noindex,nofollow'
})

const route = useRoute()
const { profile, refreshProfile, authHeaders } = useAuth()

async function syncFromSession() {
  const sessionId = route.query.session_id
  if (typeof sessionId !== 'string' || !sessionId) return
  try {
    await $fetch('/api/stripe/sync-session', {
      method: 'POST',
      body: { sessionId },
      headers: authHeaders()
    })
  } catch (err: any) {
    console.error('[billing/success] sync-session failed', err?.data?.message || err?.message || err)
  }
}

onMounted(async () => {
  if (profile.value) {
    profile.value = { ...profile.value, subscription_status: 'active' }
  }
  await syncFromSession()
  refreshProfile()
})
</script>

<template>
  <div class="max-w-xl mx-auto px-4 md:px-6 py-16 md:py-24 text-center">
    <div class="space-y-4">
      <UIcon name="i-ph-crown-simple-fill" class="w-12 h-12 text-primary mx-auto" />
      <h1 class="text-2xl font-bold">Welcome to Pro</h1>
      <p class="text-muted">You now have full access to every premium recipe.</p>
      <div class="flex flex-wrap gap-2 justify-center pt-2">
        <UButton to="/" size="lg">Browse recipes</UButton>
        <UButton to="/account" variant="soft" size="lg">Manage subscription</UButton>
      </div>
    </div>
  </div>
</template>
