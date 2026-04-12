<script setup lang="ts">
const { isAuthenticated, isAdmin, isPro, profile, logout, loading } = useAuth()
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

const avatarInitial = computed(() =>
  (profile.value?.display_name || profile.value?.email || 'U').charAt(0).toUpperCase()
)
</script>

<template>
  <!-- Admin header (kept compact with sidebar toggle) -->
  <header v-if="isAdmin" class="h-14 flex items-center justify-between px-4 border-b border-default bg-white shrink-0">
    <div class="flex items-center gap-2 shrink-0">
      <UButton
        class="lg:hidden"
        variant="ghost"
        size="sm"
        icon="i-ph-list"
        @click="toggle"
      />
    </div>
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
    <div class="flex items-center gap-2 shrink-0">
      <template v-if="loading">
        <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin text-muted" />
      </template>
      <template v-else-if="isAuthenticated">
        <UButton
          v-if="!isPro"
          to="/pricing"
          size="sm"
          icon="i-ph-crown-simple"
          color="primary"
        >
          Upgrade
        </UButton>
        <UBadge v-else size="xs" color="primary" variant="solid" class="gap-1">
          <UIcon name="i-ph-crown-simple-fill" class="w-3 h-3" />
          Pro
        </UBadge>
        <UButton to="/account" variant="ghost" size="sm">
          {{ profile?.display_name || profile?.email }}
        </UButton>
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

  <!-- Mobbin-style header (users + logged-out) -->
  <header v-else class="h-16 flex items-center gap-6 px-6 bg-neutral-50 shrink-0">
    <!-- Left: Logo + primary nav -->
    <div class="flex items-center gap-6 shrink-0">
      <NuxtLink to="/" class="flex items-center">
        <span class="flex items-center justify-center w-8 h-8 rounded-full bg-black text-white font-black text-lg leading-none">M</span>
      </NuxtLink>
    </div>

    <!-- Center: Pill search -->
    <div class="flex-1 flex justify-center min-w-0">
      <form class="w-full max-w-xl" @submit.prevent="handleSearch">
        <label class="relative flex items-center h-10 bg-white rounded-full ring-1 ring-neutral-200 focus-within:ring-2 focus-within:ring-neutral-300 transition-all px-4 gap-2">
          <UIcon
            :name="aiSearchLoading ? 'i-ph-circle-notch' : 'i-ph-magnifying-glass'"
            class="w-4 h-4 text-neutral-400 shrink-0"
            :class="aiSearchLoading ? 'animate-spin' : ''"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search on Web..."
            class="flex-1 bg-transparent outline-none text-sm placeholder:text-neutral-400 min-w-0"
            @keydown.enter="handleSearch"
          >
          <kbd class="hidden sm:inline-flex items-center justify-center w-6 h-6 rounded-md ring-1 ring-neutral-200 text-neutral-400">
            <UIcon name="i-ph-corners-out" class="w-3 h-3" />
          </kbd>
        </label>
      </form>
    </div>

    <!-- Right: Icon actions + auth -->
    <div class="flex items-center gap-2 shrink-0">
      <button
        type="button"
        class="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full text-neutral-500 hover:text-default hover:bg-neutral-100 transition-colors"
        aria-label="Bookmarks"
      >
        <UIcon name="i-ph-bookmark-simple" class="w-5 h-5" />
      </button>
      <button
        type="button"
        class="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full text-neutral-500 hover:text-default hover:bg-neutral-100 transition-colors"
        aria-label="Notifications"
      >
        <UIcon name="i-ph-bell" class="w-5 h-5" />
      </button>

      <template v-if="loading">
        <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin text-muted" />
      </template>
      <template v-else-if="isAuthenticated">
        <NuxtLink
          v-if="!isPro"
          to="/pricing"
          class="hidden md:inline-flex items-center h-9 px-4 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors gap-1.5"
        >
          <UIcon name="i-ph-crown-simple" class="w-4 h-4" />
          Upgrade
        </NuxtLink>
        <NuxtLink
          v-else
          to="/account"
          class="hidden md:inline-flex items-center h-9 px-4 rounded-full bg-primary text-white text-sm font-semibold gap-1.5"
        >
          <UIcon name="i-ph-crown-simple-fill" class="w-4 h-4" />
          Pro
        </NuxtLink>
        <NuxtLink
          to="/account"
          class="flex items-center justify-center w-9 h-9 rounded-full bg-neutral-200 text-sm font-semibold text-default hover:ring-2 hover:ring-neutral-300 transition-all overflow-hidden"
          :aria-label="`Account · ${profile?.display_name || profile?.email || ''}`"
        >
          {{ avatarInitial }}
        </NuxtLink>
      </template>
      <template v-else>
        <NuxtLink
          to="/login"
          class="inline-flex items-center h-9 px-4 rounded-full text-sm font-semibold text-default hover:bg-neutral-100 transition-colors"
        >
          Log in
        </NuxtLink>
        <NuxtLink
          to="/register"
          class="inline-flex items-center h-9 px-4 rounded-full bg-black text-white text-sm font-semibold hover:bg-neutral-800 transition-colors"
        >
          Sign up
        </NuxtLink>
      </template>
    </div>
  </header>
</template>
