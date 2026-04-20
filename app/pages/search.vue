<script setup lang="ts">
import type { Video } from '~/types'

const { videos, loading, filters, isAnon, searchInterpretation, loadBrowse, setFilters, clearFilters } = useBrowse()
const { getVideoUrl } = useVideos()
const { isPro, isAdmin, authHeaders } = useAuth()
const route = useRoute()
const router = useRouter()

interface SliderPreset {
  title: string
  subtitle: string
  tag: string
  limit: number
}

const SLIDER_PRESETS: SliderPreset[] = [
  { title: 'Health & fitness', subtitle: 'Supplement, coaching and wellness angles', tag: 'Health & Fitness', limit: 8 },
  { title: 'Food & cooking', subtitle: 'Recipes, meal prep and food brand storytelling', tag: 'Food & Cooking', limit: 8 },
  { title: 'Technology', subtitle: 'How tech products hook, demo and convert', tag: 'Technology', limit: 8 },
  { title: 'Education', subtitle: 'Tutorials, lessons and knowledge drops', tag: 'Education', limit: 8 },
  { title: 'Business', subtitle: 'Founder stories, B2B pitches and growth plays', tag: 'Business', limit: 8 },
  { title: 'Beauty & fashion', subtitle: 'DTC beauty and style product storytelling', tag: 'Beauty & Fashion', limit: 8 }
]

const sliderVideos = ref<Video[][]>(SLIDER_PRESETS.map(() => []))
const slidersLoading = ref(false)
const slidersLoaded = ref(false)

function isLocked(video: { is_premium?: boolean | null }): boolean {
  return !!video.is_premium && !isPro.value && !isAdmin.value
}

function syncFiltersFromRoute() {
  const q = (route.query.q as string) || ''
  const tagParam = (route.query.tag as string) || ''
  const tags = tagParam ? tagParam.split(',').filter(Boolean) : []
  filters.value.search = q
  filters.value.tags = tags
}

async function loadSliders() {
  if (slidersLoaded.value) return
  slidersLoading.value = true
  try {
    const pools = await Promise.all(SLIDER_PRESETS.map(async (preset) => {
      const params = new URLSearchParams()
      params.set('tags', preset.tag)
      params.set('limit', String(preset.limit * 3))
      try {
        const res = await $fetch<{ data: Video[] }>(`/api/browse?${params.toString()}`, {
          headers: authHeaders()
        })
        return res.data || []
      } catch {
        return [] as Video[]
      }
    }))

    const claimed = new Set<string>()
    sliderVideos.value = SLIDER_PRESETS.map((preset, i) => {
      const chosen: Video[] = []
      for (const v of pools[i] || []) {
        if (claimed.has(v.id)) continue
        chosen.push(v)
        claimed.add(v.id)
        if (chosen.length >= preset.limit) break
      }
      return chosen
    })
    slidersLoaded.value = true
  } finally {
    slidersLoading.value = false
  }
}

onMounted(() => {
  syncFiltersFromRoute()
  loadBrowse()
})

// React to in-app navigations that change q or tag.
watch(() => [route.query.q, route.query.tag], () => {
  const q = (route.query.q as string) || ''
  const tagParam = (route.query.tag as string) || ''
  const tags = tagParam ? tagParam.split(',').filter(Boolean) : []
  const tagsChanged = tags.join(',') !== filters.value.tags.join(',')
  if (q !== filters.value.search || tagsChanged) {
    setFilters({ search: q, tags })
  }
})

const activeDomain = computed<string | null>(() => filters.value.tags[0] ?? null)

const hasActiveFilters = computed(() => {
  return filters.value.tags.length > 0 || filters.value.search.trim() !== ''
})

const showSliders = computed(() => !hasActiveFilters.value)

watch(showSliders, (v) => {
  if (v) loadSliders()
}, { immediate: true })

const EMPTY_STATE_EXAMPLES = [
  'meal planning app',
  'B2B SaaS',
  'organic skincare',
  'online course'
] as const

function trySearch(query: string) {
  router.replace({
    query: { ...route.query, q: query }
  })
}

function resetAll() {
  clearFilters()
  router.replace({ query: {} })
}

const showInterpretation = computed(() => {
  const interp = searchInterpretation.value
  if (!interp || filters.value.search.trim().length < 3) return false
  return (
    interp.tags.length > 0
    || interp.keywords.length > 0
    || interp.marketingAngles.length > 0
  )
})

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds >= 3600) return null
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
    <!-- Results header -->
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 v-if="filters.search" class="text-2xl font-semibold tracking-tight text-default">
          Results for "{{ filters.search }}"
        </h1>
        <h1 v-else-if="activeDomain" class="text-2xl font-semibold tracking-tight text-default">
          Browsing {{ activeDomain }}
        </h1>
        <h1 v-else class="text-2xl font-semibold tracking-tight text-default">
          Browse all recipes
        </h1>
        <p v-if="!loading && hasActiveFilters" class="text-sm text-muted mt-0.5">
          {{ videos.length }} {{ videos.length === 1 ? 'recipe' : 'recipes' }}
        </p>
        <p v-else-if="!showSliders && !loading" class="text-sm text-muted mt-0.5">
          {{ videos.length }} {{ videos.length === 1 ? 'recipe' : 'recipes' }}
        </p>
      </div>

      <UButton
        v-if="hasActiveFilters"
        variant="ghost"
        size="sm"
        icon="i-ph-x"
        @click="resetAll"
      >
        Clear
      </UButton>
    </header>

    <!-- Sliders view: no filters active, browse by domain -->
    <div v-if="showSliders" class="space-y-10">
      <LandingSearchSlider
        v-for="(preset, i) in SLIDER_PRESETS"
        :key="preset.title"
        :title="preset.title"
        :subtitle="preset.subtitle"
        :tag="preset.tag"
        :videos="sliderVideos[i] || []"
        :loading="slidersLoading"
      />
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="flex items-center justify-center py-20">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-dimmed" />
    </div>

    <!-- Empty -->
    <div v-else-if="videos.length === 0" class="text-center py-20">
      <UIcon name="i-ph-video" class="w-16 h-16 mx-auto text-dimmed" />
      <h3 class="mt-4 text-lg font-medium">No recipes found</h3>
      <p class="mt-2 text-muted max-w-md mx-auto">
        <template v-if="filters.search.trim()">
          Nothing matched "{{ filters.search }}" yet. Try a broader product or category.
        </template>
        <template v-else-if="filters.tags.length">
          Try adjusting your filters.
        </template>
        <template v-else>
          Recipes will appear here once published.
        </template>
      </p>

      <div v-if="filters.search.trim()" class="mt-5 flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
        <button
          v-for="example in EMPTY_STATE_EXAMPLES"
          :key="example"
          type="button"
          class="px-3 py-1.5 rounded-full text-sm bg-default ring-1 ring-default hover:ring-accented hover:bg-muted text-default transition-colors"
          @click="trySearch(example)"
        >
          {{ example }}
        </button>
      </div>

      <UButton v-if="hasActiveFilters" class="mt-5" variant="soft" @click="resetAll">
        Clear filters
      </UButton>
    </div>

    <!-- Masonry (CSS columns) -->
    <div v-else class="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
      <NuxtLink
        v-for="video in videos"
        :key="video.id"
        :to="`/recipe/${video.id}`"
        class="group block break-inside-avoid mb-4 bg-default rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
      >
        <div class="relative aspect-9/16 bg-neutral-100">
          <video
            :src="getVideoUrl(video.video_path)"
            class="w-full h-full object-cover"
            :class="{ 'blur-md scale-110': isLocked(video) }"
            preload="metadata"
            muted
            playsinline
          />
          <div
            v-if="isLocked(video)"
            class="absolute inset-0 bg-black/40 flex items-center justify-center"
          >
            <UIcon name="i-ph-lock-fill" class="w-8 h-8 text-white drop-shadow-lg" />
          </div>
          <div
            v-else
            class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <UIcon name="i-ph-play-circle-fill" class="w-12 h-12 text-white drop-shadow-lg" />
          </div>
          <div
            v-if="video.is_premium"
            class="absolute top-2 left-2 bg-primary text-inverted text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider flex items-center gap-1"
          >
            <UIcon name="i-ph-crown-simple-fill" class="w-3 h-3" />
            Pro
          </div>
          <div
            v-if="formatDuration(video.duration_seconds)"
            class="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-1.5 py-0.5 rounded font-medium"
          >
            {{ formatDuration(video.duration_seconds) }}
          </div>
        </div>

        <div class="p-3">
          <p class="text-sm font-medium line-clamp-2 text-default">
            {{ video.title || video.creator_handle || 'Untitled' }}
          </p>
          <div v-if="video.creator_handle" class="text-xs text-muted mt-0.5">
            @{{ video.creator_handle }}
          </div>
          <div v-if="(video.semantic_tags || []).length" class="flex flex-wrap gap-1 mt-2">
            <UBadge
              v-for="tag in (video.semantic_tags || []).slice(0, 3)"
              :key="tag"
              size="xs"
              color="neutral"
              variant="subtle"
            >
              {{ tag }}
            </UBadge>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Anon invite footer: browsing is open; sign-up unlocks bookmarking & Pro content -->
    <div
      v-if="isAnon && videos.length > 0 && !loading"
      class="mt-10 bg-default border border-default rounded-2xl p-6 md:p-8 text-center space-y-3"
    >
      <UIcon name="i-ph-bookmark-simple" class="w-8 h-8 text-primary mx-auto" />
      <h3 class="text-lg font-semibold">
        Save recipes for later
      </h3>
      <p class="text-muted text-sm max-w-md mx-auto">
        Create a free account to bookmark the recipes you want to steal. Pro unlocks premium ones.
      </p>
      <div class="flex flex-wrap gap-2 justify-center pt-2">
        <UButton to="/register" size="lg" icon="i-ph-user-plus">Sign up — it's free</UButton>
        <UButton to="/login" size="lg" variant="ghost">Log in</UButton>
      </div>
    </div>
  </div>
</template>
