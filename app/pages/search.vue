<script setup lang="ts">
import type { Video } from '~/types'

const { videos, loading, filters, searchInterpretation, loadBrowse, setFilters, clearFilters } = useBrowse()
const { getVideoUrl } = useVideos()
const { authHeaders } = useAuth()
const route = useRoute()
const router = useRouter()

useSeoMeta({
  title: 'Browse marketing videos',
  description: 'Browse short-form marketing videos and find hooks, bridges, and CTAs from real creators across every category.',
  ogTitle: 'Browse marketing videos · Hookcrow',
  ogDescription: 'A creative reference library of short-form marketing videos.',
  twitterTitle: 'Browse marketing videos · Hookcrow',
  twitterDescription: 'A creative reference library of short-form marketing videos.'
})

useCanonical()

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

// The library is open — anonymous visitors see the same results as members.
const visibleVideos = computed(() => videos.value)

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
    <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 space-y-4">
      <NuxtLink
        v-for="video in visibleVideos"
        :key="video.id"
        :to="`/recipe/${video.id}`"
        class="group block break-inside-avoid mb-4 bg-default rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
      >
        <div class="relative aspect-9/16 bg-neutral-100">
          <video
            v-if="video.video_path"
            :src="getVideoUrl(video.video_path)"
            class="w-full h-full object-cover"
            preload="metadata"
            muted
            playsinline
          />
          <img
            v-else-if="video.thumbnail_url"
            :src="video.thumbnail_url"
            class="w-full h-full object-cover"
            loading="lazy"
            :alt="video.title || `Recipe by ${video.creator_handle || 'creator'}`"
          >
          <div v-else class="w-full h-full flex items-center justify-center">
            <UIcon name="i-ph-film-strip" class="w-10 h-10 text-dimmed" />
          </div>
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <UIcon name="i-ph-play-circle-fill" class="w-12 h-12 text-white drop-shadow-lg" />
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

  </div>
</template>
