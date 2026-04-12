<script setup lang="ts">
const { videos, loading, filters, isAnon, teaserLimit, searchInterpretation, loadBrowse, setFilters, clearFilters } = useBrowse()
const { getVideoUrl } = useVideos()
const { isPro, isAdmin } = useAuth()
const route = useRoute()

function isLocked(video: { is_premium?: boolean | null }): boolean {
  return !!video.is_premium && !isPro.value && !isAdmin.value
}

onMounted(() => {
  const searchQuery = (route.query.search as string) || ''
  if (searchQuery) {
    filters.value.search = searchQuery
  }
  loadBrowse()
})

// Watch for route query search changes (from AppHeader)
watch(() => route.query.search, (val) => {
  const search = (val as string) || ''
  if (search !== filters.value.search) {
    setFilters({ search })
  }
})

const activeDomain = computed<string | null>(() => filters.value.tags[0] ?? null)

function selectDomain(domain: string | null) {
  setFilters({ tags: domain ? [domain] : [] })
}

const hasActiveFilters = computed(() => {
  return filters.value.tags.length > 0 || filters.value.search.trim() !== ''
})

const showInterpretation = computed(() => {
  return searchInterpretation.value
    && filters.value.search.trim().length >= 3
    && (searchInterpretation.value.tags.length > 0 || searchInterpretation.value.keywords.length > 0)
})

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds >= 3600) return null
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-8 space-y-10 scroll-smooth">
    <!-- Hero -->
    <LandingHero :videos="videos" />

    <!-- Browse -->
    <section id="browse" class="scroll-mt-20 space-y-5">
      <LandingDomainTabs
        :model-value="activeDomain"
        @update:model-value="selectDomain"
      />

      <!-- AI interpretation context -->
      <div
        v-if="showInterpretation"
        class="p-3 bg-indigo-50 rounded-lg flex items-start gap-3"
      >
        <UIcon name="i-ph-sparkle" class="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div class="flex-1">
          <p class="text-sm font-medium text-default">{{ searchInterpretation!.intent }}</p>
          <div class="flex flex-wrap gap-1.5 mt-1.5">
            <UBadge
              v-for="tag in searchInterpretation!.tags"
              :key="tag"
              size="xs"
              color="primary"
              variant="subtle"
            >
              {{ tag }}
            </UBadge>
            <UBadge
              v-for="kw in searchInterpretation!.keywords"
              :key="kw"
              size="xs"
              color="neutral"
              variant="subtle"
            >
              {{ kw }}
            </UBadge>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-neutral-400" />
      </div>

      <!-- Empty -->
      <div v-else-if="videos.length === 0" class="text-center py-20">
        <UIcon name="i-ph-video" class="w-16 h-16 mx-auto text-neutral-300" />
        <h3 class="mt-4 text-lg font-medium">No recipes found</h3>
        <p class="mt-2 text-muted">
          {{ hasActiveFilters ? 'Try adjusting your filters or rephrasing your search.' : 'Recipes will appear here once published.' }}
        </p>
        <UButton v-if="hasActiveFilters" class="mt-4" variant="soft" @click="clearFilters">
          Clear filters
        </UButton>
      </div>

      <!-- Masonry (CSS columns) -->
      <div v-else class="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
        <NuxtLink
          v-for="video in videos"
          :key="video.id"
          :to="`/recipe/${video.id}`"
          class="group block break-inside-avoid mb-4 bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <!-- Thumbnail (native 9:16 aspect for vertical shorts) -->
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
              <UIcon
                name="i-ph-play-circle-fill"
                class="w-12 h-12 text-white drop-shadow-lg"
              />
            </div>
            <!-- Premium badge -->
            <div
              v-if="video.is_premium"
              class="absolute top-2 left-2 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider flex items-center gap-1"
            >
              <UIcon name="i-ph-crown-simple-fill" class="w-3 h-3" />
              Pro
            </div>
            <!-- Duration badge -->
            <div
              v-if="formatDuration(video.duration_seconds)"
              class="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-1.5 py-0.5 rounded font-medium"
            >
              {{ formatDuration(video.duration_seconds) }}
            </div>
          </div>

          <!-- Info -->
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

      <!-- Anon teaser footer: prompt to sign up for the full catalogue -->
      <div
        v-if="isAnon && videos.length > 0 && !loading"
        class="mt-10 bg-white border border-default rounded-2xl p-6 md:p-8 text-center space-y-3"
      >
        <UIcon name="i-ph-lock-key" class="w-8 h-8 text-primary mx-auto" />
        <h3 class="text-lg font-semibold">
          You're seeing the first {{ teaserLimit || videos.length }} recipes
        </h3>
        <p class="text-muted text-sm max-w-md mx-auto">
          Create a free account to browse the full catalogue. Premium recipes require a Pro subscription.
        </p>
        <div class="flex flex-wrap gap-2 justify-center pt-2">
          <UButton to="/register" size="lg" icon="i-ph-user-plus">Sign up — it's free</UButton>
          <UButton to="/login" size="lg" variant="ghost">Log in</UButton>
        </div>
      </div>
    </section>
  </div>
</template>
