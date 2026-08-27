<script setup lang="ts">
const { isAuthenticated, isPro, profile, logout, loading } = useAuth()
const router = useRouter()
const route = useRoute()

const searchQuery = ref((route.query.q as string) || '')
const aiSearchLoading = useState('ai-search-loading', () => false)

// The landing page has its own hero-sized search input; hiding the header
// one on "/" avoids a second, competing affordance. It reappears after the
// user lands on the results page.
const showHeaderSearch = computed(() => route.path !== '/')

function handleSearch() {
  const trimmed = searchQuery.value.trim()
  if (route.path === '/search') {
    router.replace({ query: { ...route.query, q: trimmed || undefined } })
  } else {
    router.push({ path: '/search', query: trimmed ? { q: trimmed } : undefined })
  }
}

async function handleLogout() {
  await logout()
  router.push('/')
}

// Sync search input when route query changes
watch(() => route.query.q, (val) => {
  searchQuery.value = (val as string) || ''
})

const avatarInitial = computed(() =>
  (profile.value?.display_name || profile.value?.email || 'U').charAt(0).toUpperCase()
)
</script>

<template>
  <!-- Mobbin-style header (users + logged-out) -->
  <header class="h-16 flex items-center gap-3 md:gap-6 px-4 md:px-6 bg-muted shrink-0">
    <!-- Left: Logo + primary nav -->
    <div class="flex items-center gap-6 shrink-0">
      <NuxtLink to="/" class="flex items-center gap-2" aria-label="Hookcrow — home">
        <img src="/icon.svg" alt="" width="32" height="32" class="w-8 h-8">
        <span class="hidden sm:inline text-[17px] font-bold tracking-tight text-default">hookcrow</span>
      </NuxtLink>
    </div>

    <!-- Center: Pill search (hidden on landing — hero owns that affordance there) -->
    <div class="flex-1 flex justify-center min-w-0">
      <form v-if="showHeaderSearch" class="w-full max-w-xl" @submit.prevent="handleSearch">
        <label class="relative flex items-center h-10 bg-default rounded-full ring-1 ring-default focus-within:ring-2 focus-within:ring-accented transition-all px-4 gap-2">
          <UIcon
            :name="aiSearchLoading ? 'i-ph-circle-notch' : 'i-ph-magnifying-glass'"
            class="w-4 h-4 text-dimmed shrink-0"
            :class="aiSearchLoading ? 'animate-spin' : ''"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="What are you marketing?"
            class="flex-1 bg-transparent outline-none text-sm placeholder:text-dimmed min-w-0"
            @keydown.enter="handleSearch"
          >
          <kbd class="hidden sm:inline-flex items-center justify-center w-6 h-6 rounded-md ring-1 ring-default text-dimmed">
            <UIcon name="i-ph-corners-out" class="w-3 h-3" />
          </kbd>
        </label>
      </form>
    </div>

    <!-- Right: Icon actions + auth -->
    <div class="flex items-center gap-2 shrink-0">
      <NuxtLink
        v-if="isAuthenticated"
        to="/bookmarks"
        class="inline-flex items-center justify-center w-9 h-9 rounded-full text-muted hover:text-default hover:bg-elevated transition-colors"
        aria-label="Bookmarks"
      >
        <UIcon name="i-ph-bookmark-simple" class="w-5 h-5" />
      </NuxtLink>

      <template v-if="loading">
        <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin text-muted" />
      </template>
      <template v-else-if="isAuthenticated">
        <NuxtLink
          v-if="!isPro"
          to="/pricing"
          class="hidden md:inline-flex items-center h-9 px-4 rounded-full bg-primary text-inverted text-sm font-semibold hover:bg-primary/90 transition-colors gap-1.5"
        >
          <UIcon name="i-ph-crown-simple" class="w-4 h-4" />
          Upgrade
        </NuxtLink>
        <NuxtLink
          v-else
          to="/account"
          class="hidden md:inline-flex items-center h-9 px-4 rounded-full bg-primary text-inverted text-sm font-semibold gap-1.5"
        >
          <UIcon name="i-ph-crown-simple-fill" class="w-4 h-4" />
          Pro
        </NuxtLink>
        <NuxtLink
          to="/account"
          class="flex items-center justify-center w-9 h-9 rounded-full bg-elevated text-sm font-semibold text-default hover:ring-2 hover:ring-accented transition-all overflow-hidden"
          :aria-label="`Account · ${profile?.display_name || profile?.email || ''}`"
        >
          {{ avatarInitial }}
        </NuxtLink>
      </template>
      <template v-else>
        <NuxtLink
          to="/pricing"
          class="inline-flex items-center h-9 px-3 md:px-4 rounded-full text-sm font-semibold text-default hover:bg-elevated transition-colors"
        >
          Pricing
        </NuxtLink>
        <NuxtLink
          to="/login"
          class="inline-flex items-center h-9 px-3 md:px-4 rounded-full text-sm font-semibold text-default hover:bg-elevated transition-colors"
        >
          Log in
        </NuxtLink>
        <NuxtLink
          to="/register"
          class="inline-flex items-center h-9 px-3 md:px-4 rounded-full bg-primary text-inverted text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Sign up
        </NuxtLink>
      </template>
    </div>
  </header>
</template>
