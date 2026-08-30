<script setup lang="ts">
const { public: pub } = useRuntimeConfig()
const siteUrl = (pub.siteUrl || '').replace(/\/$/, '')

// Default social image. Set here rather than in nuxt.config's static head
// because og:image must be an absolute URL and SITE_URL is not available at
// Docker build time — baking it in would ship "http://localhost:3000/og-image.png"
// to production. Pages that set their own ogImage override this.
useSeoMeta({
  ogImage: `${siteUrl}/og-image.png`,
  twitterImage: `${siteUrl}/og-image.png`
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
