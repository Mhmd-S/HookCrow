<script setup lang="ts">
import { SEMANTIC_TAG_CATEGORIES } from '~/types'

const { videos, logicFlows, loading, filters, searchInterpretation, loadBrowse, setFilters, clearFilters } = useBrowse()
const { getVideoUrl } = useVideos()
const route = useRoute()

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

function getLogicFlowShortName(name: string): string {
  const match = name.match(/^([^(]+)/)
  return match?.[1] ? match[1].trim() : name
}

// Build filter chips: "For You" + logic flows + domain tags
interface FilterChip {
  label: string
  type: 'all' | 'logicFlow' | 'domain'
  value: string
}

const filterChips = computed<FilterChip[]>(() => {
  const chips: FilterChip[] = [
    { label: 'For You', type: 'all', value: '' }
  ]

  for (const lf of logicFlows.value) {
    chips.push({
      label: getLogicFlowShortName(lf.name),
      type: 'logicFlow',
      value: lf.id
    })
  }

  for (const domain of (SEMANTIC_TAG_CATEGORIES.domain as unknown as string[])) {
    chips.push({
      label: domain,
      type: 'domain',
      value: domain
    })
  }

  return chips
})

function isChipActive(chip: FilterChip): boolean {
  if (chip.type === 'all') {
    return !filters.value.logicFlowId && filters.value.domains.length === 0
  }
  if (chip.type === 'logicFlow') {
    return filters.value.logicFlowId === chip.value
  }
  if (chip.type === 'domain') {
    return filters.value.domains.includes(chip.value)
  }
  return false
}

function toggleChip(chip: FilterChip) {
  if (chip.type === 'all') {
    clearFilters()
    return
  }

  if (chip.type === 'logicFlow') {
    setFilters({
      logicFlowId: filters.value.logicFlowId === chip.value ? null : chip.value,
      domains: []
    })
    return
  }

  if (chip.type === 'domain') {
    const current = [...filters.value.domains]
    const idx = current.indexOf(chip.value)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(chip.value)
    }
    setFilters({ domains: current, logicFlowId: null })
  }
}

const hasActiveFilters = computed(() => {
  return filters.value.domains.length > 0
    || filters.value.formats.length > 0
    || filters.value.logicFlowId !== null
    || filters.value.search.trim() !== ''
})

const showInterpretation = computed(() => {
  return searchInterpretation.value
    && filters.value.search.trim().length >= 3
    && (searchInterpretation.value.tags.length > 0 || searchInterpretation.value.keywords.length > 0)
})
</script>

<template>
  <div class="p-6">
    <!-- Filter chips (scrollable) -->
    <div class="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
      <button
        v-for="chip in filterChips"
        :key="`${chip.type}-${chip.value}`"
        class="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
        :class="isChipActive(chip)
          ? 'bg-primary text-white'
          : 'bg-neutral-100 text-default hover:bg-neutral-200'"
        @click="toggleChip(chip)"
      >
        {{ chip.label }}
      </button>
    </div>

    <!-- AI interpretation context -->
    <div
      v-if="showInterpretation"
      class="mb-4 p-3 bg-indigo-50 rounded-lg flex items-start gap-3"
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
      <h3 class="mt-4 text-lg font-medium">No videos found</h3>
      <p class="mt-2 text-muted">
        {{ hasActiveFilters ? 'Try adjusting your filters or rephrasing your search.' : 'Videos will appear here once published.' }}
      </p>
      <UButton v-if="hasActiveFilters" class="mt-4" variant="soft" @click="clearFilters">
        Clear filters
      </UButton>
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      <NuxtLink
        v-for="video in videos"
        :key="video.id"
        :to="`/recipe/${video.id}`"
        class="group bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
      >
        <!-- Thumbnail -->
        <div class="relative aspect-9/16 bg-neutral-100">
          <video
            :src="getVideoUrl(video.video_path)"
            class="w-full h-full object-cover"
            preload="metadata"
          />
          <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <UIcon
              name="i-ph-play-circle"
              class="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
          <!-- Duration badge -->
          <div v-if="video.duration_seconds && video.duration_seconds < 3600" class="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
            {{ Math.floor(video.duration_seconds / 60) }}:{{ String(Math.round(video.duration_seconds % 60)).padStart(2, '0') }}
          </div>
          <!-- Logic Flow Badge -->
          <div v-if="video.logic_flow" class="absolute top-2 left-2">
            <UBadge size="xs" color="primary" variant="solid">
              {{ getLogicFlowShortName((video.logic_flow as any).name || '') }}
            </UBadge>
          </div>
        </div>

        <!-- Info -->
        <div class="p-3">
          <p class="text-sm font-medium line-clamp-2">
            {{ video.title || video.creator_handle || 'Untitled' }}
          </p>
          <div class="flex flex-wrap gap-1 mt-2">
            <UBadge
              v-for="tag in (video.semantic_tags || []).slice(0, 2)"
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
