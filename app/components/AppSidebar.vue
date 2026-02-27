<script setup lang="ts">
const { isAuthenticated, isAdmin } = useAuth()
const route = useRoute()
const { close } = useSidebarState()

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

// Auto-close sidebar on mobile when navigating
watch(() => route.path, () => {
  close()
})
</script>

<template>
  <nav class="w-[220px] h-full flex flex-col bg-white border-r border-default shrink-0">
    <!-- Logo -->
    <div class="h-14 flex items-center gap-2 px-4 border-b border-default shrink-0">
      <UIcon name="i-ph-film-strip" class="w-5 h-5 text-primary" />
      <NuxtLink to="/" class="font-bold text-default text-sm">Video Anatomizer</NuxtLink>
    </div>

    <!-- Scrollable nav -->
    <div class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      <!-- Upload CTA -->
      <UButton
        v-if="isAuthenticated"
        to="/upload"
        block
        icon="i-ph-plus"
        class="mb-4"
      >
        Upload Video
      </UButton>

      <!-- Home -->
      <NuxtLink
        to="/"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
        :class="isActive('/') ? 'bg-neutral-100 font-medium text-default' : 'text-muted hover:bg-neutral-50'"
      >
        <UIcon name="i-ph-planet" class="w-4 h-4 shrink-0" />
        <span>Explore</span>
      </NuxtLink>

      <!-- My Library -->
      <template v-if="isAuthenticated">
        <p class="px-3 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-dimmed">
          My Library
        </p>

        <NuxtLink
          to="/my-videos"
          class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
          :class="isActive('/my-videos') ? 'bg-neutral-100 font-medium text-default' : 'text-muted hover:bg-neutral-50'"
        >
          <UIcon name="i-ph-video" class="w-4 h-4 shrink-0" />
          <span>My Videos</span>
        </NuxtLink>
      </template>

      <!-- Admin -->
      <template v-if="isAdmin">
        <p class="px-3 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-dimmed">
          Admin
        </p>

        <NuxtLink
          to="/admin"
          class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
          :class="isActive('/admin') && !isActive('/admin/anatomize') ? 'bg-neutral-100 font-medium text-default' : 'text-muted hover:bg-neutral-50'"
        >
          <UIcon name="i-ph-gauge" class="w-4 h-4 shrink-0" />
          <span>Dashboard</span>
        </NuxtLink>

        <NuxtLink
          to="/admin/anatomize"
          class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
          :class="isActive('/admin/anatomize') ? 'bg-neutral-100 font-medium text-default' : 'text-muted hover:bg-neutral-50'"
        >
          <UIcon name="i-ph-scissors" class="w-4 h-4 shrink-0" />
          <span>New Anatomize</span>
        </NuxtLink>
      </template>
    </div>

    <!-- Bottom -->
    <div class="px-3 py-3 border-t border-default shrink-0">
      <div class="flex items-center gap-2 px-3 py-2 text-xs text-dimmed">
        <UIcon name="i-ph-sparkle" class="w-3.5 h-3.5" />
        <span>What's new</span>
      </div>
    </div>
  </nav>
</template>
