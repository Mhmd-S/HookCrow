<script setup lang="ts">
const { initAuth } = useAuth()
const route = useRoute()

onMounted(() => {
  initAuth()
})

// Hide navbar on login/register pages and admin editor (full-screen layout)
const showNavbar = computed(() => {
  const path = route.path
  return !path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/admin/anatomize/')
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <AppNavbar v-if="showNavbar" />
    <NuxtPage />
  </UApp>
</template>
