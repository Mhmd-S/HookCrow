<script setup lang="ts">
const { isAuthenticated, isAdmin, profile, logout, loading } = useAuth()
const router = useRouter()

async function handleLogout() {
  await logout()
  router.push('/')
}
</script>

<template>
  <nav class="h-12 flex items-center justify-between px-4 border-b border-default bg-white shrink-0">
    <!-- Left: Brand + Links -->
    <div class="flex items-center gap-4">
      <NuxtLink to="/" class="font-bold text-default">
        Video Anatomizer
      </NuxtLink>

      <div class="flex items-center gap-1">
        <UButton to="/" variant="ghost" size="sm">Browse</UButton>
        <template v-if="isAuthenticated && !loading">
          <UButton to="/my-videos" variant="ghost" size="sm">My Videos</UButton>
          <UButton to="/upload" variant="ghost" size="sm">Upload</UButton>
          <UButton v-if="isAdmin" to="/admin" variant="ghost" size="sm" color="primary">
            Admin
          </UButton>
        </template>
      </div>
    </div>

    <!-- Right: Auth -->
    <div class="flex items-center gap-2">
      <template v-if="loading">
        <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin text-muted" />
      </template>
      <template v-else-if="isAuthenticated">
        <span class="text-sm text-muted">{{ profile?.display_name || profile?.email }}</span>
        <UButton variant="ghost" size="sm" @click="handleLogout">
          Log out
        </UButton>
      </template>
      <template v-else>
        <UButton to="/login" variant="ghost" size="sm">Log in</UButton>
        <UButton to="/register" size="sm">Sign up</UButton>
      </template>
    </div>
  </nav>
</template>
