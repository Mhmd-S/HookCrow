<script setup lang="ts">
type Layout = 'card' | 'banner'

const props = withDefaults(defineProps<{ layout?: Layout }>(), {
  layout: 'banner'
})

const { isAuthenticated } = useAuth()
const route = useRoute()
const router = useRouter()

// The library is open, so the only CTA left is a free sign-up prompt for
// anonymous visitors — nothing here gates content.
const shouldShow = computed(() => !isAuthenticated.value)

const email = ref('')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function registerHref(prefillEmail?: string) {
  const params = new URLSearchParams()
  params.set('redirect', route.fullPath)
  if (prefillEmail) params.set('email', prefillEmail)
  return `/register?${params.toString()}`
}

function loginHref() {
  return `/login?redirect=${encodeURIComponent(route.fullPath)}`
}

function onEmailSubmit() {
  const value = email.value.trim()
  if (!EMAIL_RE.test(value)) return
  router.push(registerHref(value))
}
</script>

<template>
  <template v-if="shouldShow">
    <!-- Card layout: fits inside the carousel as the last slide -->
    <NuxtLink
      v-if="props.layout === 'card'"
      :to="registerHref()"
      class="group shrink-0 w-40 md:w-44 snap-start block"
    >
      <div
        class="relative aspect-9/16 rounded-xl overflow-hidden bg-primary-600 p-5 flex flex-col justify-between text-white"
      >
        <div class="flex items-start justify-between">
          <UIcon name="i-ph-user-plus" class="w-5 h-5 text-white/70" />
          <span class="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/70">
            Free
          </span>
        </div>

        <div class="space-y-4">
          <div class="h-px w-8 bg-white/40" />
          <h3 class="text-base font-semibold leading-snug tracking-tight text-white">
            Create a free account
          </h3>
          <span
            class="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 bg-white rounded-full pl-3 pr-2.5 py-1.5"
          >
            Sign up
            <UIcon name="i-ph-arrow-right" class="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </NuxtLink>

    <!-- Banner — captures email inline -->
    <div
      v-else
      class="rounded-2xl bg-primary-600 p-8 md:p-12 text-center space-y-6"
    >
      <div class="space-y-4 max-w-xl mx-auto">
        <div class="flex items-center justify-center gap-3">
          <div class="h-px w-8 bg-white/40" />
          <span class="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
            Free account
          </span>
          <div class="h-px w-8 bg-white/40" />
        </div>
        <h3 class="text-2xl md:text-3xl font-semibold tracking-tight leading-tight text-white">
          Save the recipes you like
        </h3>
        <p class="text-white/80 text-sm md:text-base leading-relaxed">
          The whole library is free to read. Sign up to bookmark hooks, bridges and CTAs for later. No credit card, ever.
        </p>
      </div>

      <form
        class="flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
        @submit.prevent="onEmailSubmit"
      >
        <UInput
          v-model="email"
          type="email"
          placeholder="you@example.com"
          size="lg"
          class="flex-1"
          icon="i-ph-envelope-simple"
          required
          autocomplete="email"
          :ui="{ base: 'bg-white text-neutral-900 placeholder:text-neutral-400 ring-0 focus-visible:ring-2 focus-visible:ring-white' }"
        />
        <UButton
          type="submit"
          size="lg"
          color="neutral"
          icon="i-ph-arrow-right"
          :disabled="!EMAIL_RE.test(email.trim())"
          :ui="{ base: 'bg-white text-primary-600 hover:bg-white/90 disabled:bg-white/70 disabled:text-white/60 font-semibold' }"
        >
          Sign up free
        </UButton>
      </form>

      <p class="text-xs text-white/70">
        Already have an account?
        <NuxtLink :to="loginHref()" class="text-white font-medium underline underline-offset-4">
          Log in
        </NuxtLink>
      </p>
    </div>

  </template>
</template>
