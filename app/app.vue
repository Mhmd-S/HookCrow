<script setup lang="ts">
const { initAuth } = useAuth()

onMounted(() => {
  initAuth()
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
