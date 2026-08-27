<script setup lang="ts">
const { profile, loading, logout } = useAuth()
const { toggle } = useSidebarState()
const router = useRouter()

async function handleLogout() {
  await logout()
  router.push('/')
}
</script>

<template>
  <header class="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-default bg-default">
    <UButton
      class="lg:hidden"
      variant="ghost"
      color="neutral"
      size="sm"
      icon="i-ph-list"
      aria-label="Toggle sidebar"
      @click="toggle"
    />

    <div class="flex-1" />

    <div class="flex items-center gap-1 shrink-0">
      <UButton
        to="/"
        variant="ghost"
        color="neutral"
        size="sm"
        icon="i-ph-arrow-square-out"
      >
        View site
      </UButton>
      <template v-if="loading">
        <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin text-muted" />
      </template>
      <template v-else>
        <UButton to="/account" variant="ghost" color="neutral" size="sm">
          {{ profile?.display_name || profile?.email }}
        </UButton>
        <UButton variant="ghost" color="neutral" size="sm" @click="handleLogout">
          Log out
        </UButton>
      </template>
    </div>
  </header>
</template>
