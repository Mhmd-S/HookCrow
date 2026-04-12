<script setup lang="ts">
const { refreshProfile, isPro } = useAuth()

const checking = ref(true)
let attempts = 0
const maxAttempts = 10

async function poll() {
  attempts += 1
  await refreshProfile()
  if (isPro.value || attempts >= maxAttempts) {
    checking.value = false
    return
  }
  setTimeout(poll, 1500)
}

onMounted(poll)
</script>

<template>
  <div class="max-w-xl mx-auto px-6 py-24 text-center">
    <div v-if="checking && !isPro" class="space-y-4">
      <UIcon name="i-ph-circle-notch" class="w-10 h-10 text-primary animate-spin mx-auto" />
      <h1 class="text-xl font-semibold">Activating your Pro subscription…</h1>
      <p class="text-muted text-sm">This usually takes a few seconds while Stripe confirms the payment.</p>
    </div>

    <div v-else-if="isPro" class="space-y-4">
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
