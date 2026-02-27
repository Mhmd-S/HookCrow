<script setup lang="ts">
const { isAuthenticated, profile, logout, loading } = useAuth()
const router = useRouter()
const route = useRoute()
const { toggle } = useSidebarState()

const searchQuery = ref((route.query.search as string) || '')
const aiSearchLoading = useState('ai-search-loading', () => false)

function handleSearch() {
  const trimmed = searchQuery.value.trim()
  if (route.path === '/') {
    router.replace({ query: { ...route.query, search: trimmed || undefined } })
  } else {
    router.push({ path: '/', query: trimmed ? { search: trimmed } : undefined })
  }
}

async function handleLogout() {
  await logout()
  router.push('/')
}

// Sync search input when route query changes
watch(() => route.query.search, (val) => {
  searchQuery.value = (val as string) || ''
})
</script>

<template>
  <header class="h-14 flex items-center justify-between px-4 border-b border-default bg-white shrink-0">
    <!-- Left: Mobile menu toggle -->
    <div class="flex items-center gap-2">
      <UButton
        class="lg:hidden"
        variant="ghost"
        size="sm"
        icon="i-ph-list"
        @click="toggle"
      />
    </div>

    <!-- Center: Search -->
    <div class="flex-1 flex justify-center px-4">
      <form class="w-full max-w-md" @submit.prevent="handleSearch">
        <UInput
          v-model="searchQuery"
          placeholder="Search for anything..."
          :icon="aiSearchLoading ? 'i-ph-circle-notch' : 'i-ph-magnifying-glass'"
          size="sm"
          class="w-full"
          :ui="aiSearchLoading ? { leadingIcon: 'animate-spin' } : {}"
          @keydown.enter="handleSearch"
        />
      </form>
    </div>

    <!-- Right: Auth -->
    <div class="flex items-center gap-2 shrink-0">
      <template v-if="loading">
        <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin text-muted" />
      </template>
      <template v-else-if="isAuthenticated">
        <span class="text-sm text-muted hidden sm:inline">{{ profile?.display_name || profile?.email }}</span>
        <UButton variant="ghost" size="sm" @click="handleLogout">
          Log out
        </UButton>
      </template>
      <template v-else>
        <UButton to="/login" variant="ghost" size="sm">Log in</UButton>
        <UButton to="/register" size="sm">Sign up</UButton>
      </template>
    </div>
  </header>
</template>
