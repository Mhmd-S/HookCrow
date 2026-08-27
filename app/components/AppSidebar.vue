<script setup lang="ts">
// Rendered only inside the `admin` layout, which is admin-gated by the
// `admin` route middleware — no isAdmin checks needed here.
const route = useRoute()
const { close } = useSidebarState()

// `/admin` is the recipe list; /admin/recipes/* are its detail + create pages.
const recipesActive = computed(
  () => route.path === '/admin' || route.path.startsWith('/admin/recipes'),
)

function isActive(path: string) {
  return route.path.startsWith(path)
}

// Auto-close sidebar on mobile when navigating
watch(() => route.path, () => {
  close()
})
</script>

<template>
  <nav class="w-[220px] h-full flex flex-col bg-default border-r border-default shrink-0">
    <!-- Logo -->
    <div class="h-14 flex items-center gap-2 px-4 border-b border-default shrink-0">
      <UIcon name="i-ph-film-strip" class="w-5 h-5 text-primary" />
      <NuxtLink to="/admin" class="font-bold text-default text-sm">Hookcrow Admin</NuxtLink>
    </div>

    <!-- Scrollable nav -->
    <div class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      <UButton to="/admin/recipes/new" block icon="i-ph-plus" class="mb-4">
        New Recipe
      </UButton>

      <NuxtLink
        to="/admin"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
        :class="recipesActive ? 'bg-elevated font-medium text-default' : 'text-muted hover:bg-elevated'"
      >
        <UIcon name="i-ph-film-strip" class="w-4 h-4 shrink-0" />
        <span>Recipes</span>
      </NuxtLink>

      <NuxtLink
        to="/admin/discovery"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
        :class="isActive('/admin/discovery') ? 'bg-elevated font-medium text-default' : 'text-muted hover:bg-elevated'"
      >
        <UIcon name="i-ph-magnifying-glass" class="w-4 h-4 shrink-0" />
        <span>Discovery</span>
      </NuxtLink>

      <NuxtLink
        to="/admin/users"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
        :class="isActive('/admin/users') ? 'bg-elevated font-medium text-default' : 'text-muted hover:bg-elevated'"
      >
        <UIcon name="i-ph-users" class="w-4 h-4 shrink-0" />
        <span>Users</span>
      </NuxtLink>
    </div>

    <!-- Bottom -->
    <div class="px-3 py-3 border-t border-default shrink-0">
      <NuxtLink
        to="/"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted hover:bg-elevated transition-colors"
      >
        <UIcon name="i-ph-planet" class="w-4 h-4 shrink-0" />
        <span>Explore site</span>
      </NuxtLink>
    </div>
  </nav>
</template>
