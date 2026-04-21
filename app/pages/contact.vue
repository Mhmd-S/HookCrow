<script setup lang="ts">
useSeoMeta({
  title: 'Contact',
  description: 'Get in touch with the Hookcrow team.',
  ogTitle: 'Contact · Hookcrow'
})

useCanonical()
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 md:px-6 py-10 space-y-4">
    <h1 class="text-2xl font-bold">Contact</h1>
    <p class="text-muted leading-relaxed">
      Have a question, bug report, or feature request? We'd love to hear from you. We usually
      reply within 1–2 business days.
    </p>

    <div class="rounded border border-default bg-muted px-4 py-6 mt-4">
      <p class="text-xs font-semibold uppercase tracking-wider text-dimmed">Email us</p>
      <a
        href="mailto:support@hookcrow.com"
        class="text-lg font-semibold text-primary hover:underline break-all"
      >
        support@hookcrow.com
      </a>
    </div>

    <p class="text-sm text-muted leading-relaxed mt-4">
      For legal questions, see our
      <NuxtLink to="/terms" class="text-primary hover:underline">Terms of Service</NuxtLink>
      and
      <NuxtLink to="/privacy" class="text-primary hover:underline">Privacy Policy</NuxtLink>.
    </p>
  </div>
</template>
