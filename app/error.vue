<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const is404 = computed(() => props.error?.statusCode === 404)

// Error pages must never be indexed — without this a soft 404 gets crawled and
// ranked under the global index,follow default from nuxt.config.
useSeoMeta({
  title: () => (is404.value ? 'Page not found' : 'Something went wrong'),
  robots: 'noindex,nofollow'
})
</script>

<template>
  <UApp>
    <div class="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <p class="text-sm font-mono text-dimmed">
        {{ error?.statusCode || 500 }}
      </p>
      <h1 class="mt-3 text-2xl font-semibold text-highlighted">
        {{ is404 ? 'We can’t find that page' : 'Something went wrong' }}
      </h1>
      <p class="mt-2 max-w-md text-sm text-muted">
        {{ is404
          ? 'The recipe or page you followed has moved, been unpublished, or never existed.'
          : 'An unexpected error occurred on our end. Try again in a moment.' }}
      </p>
      <div class="mt-6 flex items-center gap-2">
        <UButton to="/" icon="i-ph-house">
          Go home
        </UButton>
        <UButton to="/search" variant="subtle" icon="i-ph-magnifying-glass">
          Browse recipes
        </UButton>
      </div>
    </div>
  </UApp>
</template>
