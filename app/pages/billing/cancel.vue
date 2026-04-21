<script setup lang="ts">
useSeoMeta({
  title: 'Checkout cancelled',
  robots: 'noindex,nofollow'
})
</script>

<template>
  <div class="max-w-xl mx-auto px-4 md:px-6 py-16 md:py-24 text-center">
    <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
      <UIcon name="i-ph-x-circle" class="w-8 h-8 text-muted" />
    </div>
    <h1 class="text-2xl font-bold text-default">Checkout cancelled</h1>
    <p class="text-muted mt-2">No charge was made. You can try again whenever you're ready.</p>

    <div class="flex flex-wrap gap-2 justify-center pt-6">
      <UButton to="/pricing" size="lg">Back to pricing</UButton>
      <UButton to="/search" variant="ghost" size="lg">Browse free templates</UButton>
    </div>

    <p class="text-xs text-dimmed mt-8">
      Questions? Email
      <a href="mailto:support@hookcrow.com" class="text-primary hover:underline">support@hookcrow.com</a>
    </p>
  </div>
</template>
