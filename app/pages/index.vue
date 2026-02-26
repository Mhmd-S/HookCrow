<script setup lang="ts">
import { SEMANTIC_TAG_CATEGORIES } from '~/types'

const { videos, logicFlows, loading, filters, loadBrowse, setFilters, clearFilters } = useBrowse()
const { getVideoUrl } = useVideos()

onMounted(loadBrowse)

function getLogicFlowShortName(name: string): string {
  const match = name.match(/^([^(]+)/)
  return match ? match[1].trim() : name
}

const hasActiveFilters = computed(() => {
  return filters.value.domains.length > 0
    || filters.value.formats.length > 0
    || filters.value.logicFlowId !== null
    || filters.value.search.trim() !== ''
})

// Debounced search
let searchTimer: ReturnType<typeof setTimeout> | null = null
function handleSearchInput(value: string) {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    setFilters({ search: value })
  }, 400)
}
</script>

<template>
  <div class="min-h-screen bg-neutral-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-default">Video Recipe Library</h1>
        <p class="text-muted mt-2 max-w-xl mx-auto">
          Browse analyzed short-form videos and get step-by-step guides to recreate them for your own content.
        </p>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-3 mb-6 p-4 bg-white rounded-lg border border-neutral-200">
        <!-- Search -->
        <UInput
          :model-value="filters.search"
          placeholder="Search videos..."
          icon="i-ph-magnifying-glass"
          size="sm"
          class="w-56"
          @update:model-value="handleSearchInput"
        />

        <!-- Niche / Domain -->
        <USelectMenu
          :model-value="filters.domains"
          :items="(SEMANTIC_TAG_CATEGORIES.domain as unknown as string[]).map(d => ({ label: d, value: d }))"
          placeholder="Niche"
          multiple
          size="sm"
          class="w-40"
          @update:model-value="(v: any) => setFilters({ domains: v })"
        />

        <!-- Format -->
        <USelectMenu
          :model-value="filters.formats"
          :items="(SEMANTIC_TAG_CATEGORIES.format as unknown as string[]).map(f => ({ label: f, value: f }))"
          placeholder="Format"
          multiple
          size="sm"
          class="w-40"
          @update:model-value="(v: any) => setFilters({ formats: v })"
        />

        <!-- Pattern / Logic Flow -->
        <USelectMenu
          :model-value="filters.logicFlowId"
          :items="[{ label: 'All patterns', value: '' }, ...logicFlows.map(lf => ({ label: getLogicFlowShortName(lf.name), value: lf.id }))]"
          placeholder="Pattern"
          size="sm"
          class="w-44"
          @update:model-value="(v: any) => setFilters({ logicFlowId: v || null })"
        />

        <!-- Clear Filters -->
        <UButton
          v-if="hasActiveFilters"
          variant="ghost"
          size="sm"
          icon="i-ph-x"
          @click="clearFilters"
        >
          Clear
        </UButton>
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
          {{ hasActiveFilters ? 'Try adjusting your filters.' : 'Videos will appear here once published.' }}
        </p>
        <UButton v-if="hasActiveFilters" class="mt-4" variant="soft" @click="clearFilters">
          Clear filters
        </UButton>
      </div>

      <!-- Grid -->
      <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <NuxtLink
          v-for="video in videos"
          :key="video.id"
          :to="`/recipe/${video.id}`"
          class="group bg-white rounded-lg overflow-hidden border border-neutral-200 hover:border-neutral-400 transition-colors"
        >
          <!-- Thumbnail -->
          <div class="relative aspect-[9/16] bg-neutral-100">
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
            <!-- Logic Flow Badge -->
            <div v-if="video.logic_flow" class="absolute top-2 left-2">
              <UBadge size="xs" color="primary" variant="solid">
                {{ getLogicFlowShortName((video.logic_flow as any).name || '') }}
              </UBadge>
            </div>
          </div>

          <!-- Info -->
          <div class="p-3">
            <p class="text-sm font-medium truncate">
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
  </div>
</template>
