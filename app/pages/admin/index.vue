<script setup lang="ts">
import type { Video, VideoStatus, LogicFlow } from '~/types'

definePageMeta({ middleware: ['admin'] })

const { fetchVideos, deleteVideo, getVideoUrl } = useVideos()
const { logicFlows, fetchLogicFlows } = useLogicFlows()

const videos = ref<Video[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const statusFilter = ref<VideoStatus | 'all'>('all')
const viewMode = ref<'grid' | 'grouped'>('grouped')

async function loadVideos() {
  loading.value = true
  await fetchLogicFlows()
  const { data, error: err } = await fetchVideos()
  if (err) {
    error.value = err.message
  } else {
    videos.value = data || []
  }
  loading.value = false
}

async function handleDelete(id: string) {
  if (!confirm('Are you sure you want to delete this video?')) return

  const { error: err } = await deleteVideo(id)
  if (err) {
    error.value = err.message
  } else {
    await loadVideos()
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getLogicFlowName(logicFlowId: string | null): string | null {
  if (!logicFlowId) return null
  const flow = logicFlows.value.find(lf => lf.id === logicFlowId)
  return flow?.name || null
}

function getLogicFlowShortName(name: string): string {
  const match = name.match(/^([^(]+)/)
  return match ? match[1].trim() : name
}

onMounted(loadVideos)

const filteredVideos = computed(() => {
  if (statusFilter.value === 'all') return videos.value
  return videos.value.filter(v => v.status === statusFilter.value)
})

const groupedVideos = computed(() => {
  const groups: Array<{ logicFlow: LogicFlow | null; name: string; videos: Video[] }> = []

  logicFlows.value.forEach(lf => {
    const flowVideos = filteredVideos.value.filter(v => v.logic_flow_id === lf.id)
    if (flowVideos.length > 0) {
      groups.push({
        logicFlow: lf,
        name: lf.name,
        videos: flowVideos
      })
    }
  })

  const uncategorized = filteredVideos.value.filter(v => !v.logic_flow_id)
  if (uncategorized.length > 0) {
    groups.push({
      logicFlow: null,
      name: 'Uncategorized',
      videos: uncategorized
    })
  }

  return groups
})

const draftCount = computed(() => videos.value.filter(v => v.status === 'draft').length)
const completeCount = computed(() => videos.value.filter(v => v.status === 'complete').length)
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold">Admin Dashboard</h1>
          <p class="text-neutral-500 mt-1">Manage and analyze videos</p>
        </div>
        <UButton to="/admin/anatomize" icon="i-ph-plus">
          New Video
        </UButton>
      </div>

      <!-- Filter Tabs & View Toggle -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex gap-2">
          <UButton
            :variant="statusFilter === 'all' ? 'solid' : 'ghost'"
            size="sm"
            @click="statusFilter = 'all'"
          >
            All ({{ videos.length }})
          </UButton>
          <UButton
            :variant="statusFilter === 'draft' ? 'solid' : 'ghost'"
            size="sm"
            color="warning"
            @click="statusFilter = 'draft'"
          >
            Drafts ({{ draftCount }})
          </UButton>
          <UButton
            :variant="statusFilter === 'complete' ? 'solid' : 'ghost'"
            size="sm"
            color="success"
            @click="statusFilter = 'complete'"
          >
            Complete ({{ completeCount }})
          </UButton>
        </div>
        <div class="flex gap-1">
          <UButton
            :variant="viewMode === 'grouped' ? 'solid' : 'ghost'"
            size="sm"
            icon="i-ph-rows"
            @click="viewMode = 'grouped'"
          />
          <UButton
            :variant="viewMode === 'grid' ? 'solid' : 'ghost'"
            size="sm"
            icon="i-ph-grid-four"
            @click="viewMode = 'grid'"
          />
        </div>
      </div>

      <!-- Error Alert -->
      <UAlert v-if="error" color="error" :title="error" class="mb-6" />

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-neutral-400" />
      </div>

      <!-- Empty State -->
      <div v-else-if="videos.length === 0" class="text-center py-20">
        <UIcon name="i-ph-video" class="w-16 h-16 mx-auto text-neutral-300 dark:text-neutral-700" />
        <h3 class="mt-4 text-lg font-medium">No videos yet</h3>
        <p class="mt-2 text-neutral-500">Upload your first video to start anatomizing</p>
        <UButton to="/admin/anatomize" class="mt-6" icon="i-ph-plus">
          Upload Video
        </UButton>
      </div>

      <!-- Grouped View -->
      <div v-else-if="viewMode === 'grouped'" class="space-y-8">
        <div v-for="group in groupedVideos" :key="group.name" class="space-y-4">
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold">
              {{ group.logicFlow ? getLogicFlowShortName(group.name) : group.name }}
            </h2>
            <UBadge size="sm" color="neutral" variant="subtle">
              {{ group.videos.length }}
            </UBadge>
            <p v-if="group.logicFlow?.description" class="text-sm text-muted hidden md:block">
              {{ group.logicFlow.description }}
            </p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <div
              v-for="video in group.videos"
              :key="video.id"
              class="group bg-white dark:bg-neutral-900 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
            >
              <div class="relative aspect-[9/16] bg-neutral-100 dark:bg-neutral-800">
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
                <div class="absolute top-2 left-2">
                  <UBadge
                    :color="video.status === 'complete' ? 'success' : 'warning'"
                    size="xs"
                    variant="solid"
                  >
                    {{ video.status === 'complete' ? 'Complete' : 'Draft' }}
                  </UBadge>
                </div>
                <div v-if="video.is_published" class="absolute top-2 right-2">
                  <UBadge size="xs" color="success" variant="solid">Published</UBadge>
                </div>
              </div>

              <div class="p-3">
                <p v-if="video.title || video.creator_handle" class="text-sm font-medium truncate">{{ video.title || video.creator_handle }}</p>
                <p v-else class="text-sm font-medium truncate text-neutral-400">Untitled</p>
                <div class="flex items-center justify-between mt-2">
                  <p class="text-xs text-neutral-400">{{ formatDate(video.created_at) }}</p>
                  <div class="flex gap-1">
                    <UButton
                      :to="`/admin/anatomize/${video.id}`"
                      size="xs"
                      variant="ghost"
                      icon="i-ph-pencil"
                    />
                    <UButton
                      :to="`/recipe/${video.id}`"
                      size="xs"
                      variant="ghost"
                      icon="i-ph-eye"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="groupedVideos.length === 0 && !loading" class="text-center py-12 text-muted">
          No videos match the current filter
        </div>
      </div>

      <!-- Grid View -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <div
          v-for="video in filteredVideos"
          :key="video.id"
          class="group bg-white dark:bg-neutral-900 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
        >
          <div class="relative aspect-[9/16] bg-neutral-100 dark:bg-neutral-800">
            <video
              :src="getVideoUrl(video.video_path)"
              class="w-full h-full object-cover"
              preload="metadata"
            />
            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <UIcon
                name="i-ph-play-circle"
                class="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
            <div class="absolute top-2 left-2">
              <UBadge
                :color="video.status === 'complete' ? 'success' : 'warning'"
                size="xs"
                variant="solid"
              >
                {{ video.status === 'complete' ? 'Complete' : 'Draft' }}
              </UBadge>
            </div>
            <div v-if="video.logic_flow_id" class="absolute top-2 right-2">
              <UBadge size="xs" color="primary" variant="solid">
                {{ getLogicFlowShortName(getLogicFlowName(video.logic_flow_id) || '') }}
              </UBadge>
            </div>
          </div>

          <div class="p-4">
            <p v-if="video.title || video.creator_handle" class="font-medium truncate">{{ video.title || video.creator_handle }}</p>
            <p v-else class="font-medium truncate text-neutral-400">No creator</p>
            <div class="flex items-center gap-2 mt-2 text-sm text-neutral-500">
              <UBadge v-if="video.platform" size="sm" color="neutral" variant="subtle">
                {{ video.platform }}
              </UBadge>
              <UBadge v-if="video.is_published" size="sm" color="success" variant="subtle">
                Published
              </UBadge>
            </div>
            <p class="text-xs text-neutral-400 mt-2">
              {{ formatDate(video.created_at) }}
            </p>
          </div>

          <div class="px-4 pb-4 flex gap-2">
            <UButton
              :to="`/admin/anatomize/${video.id}`"
              size="sm"
              variant="soft"
              icon="i-ph-pencil"
              class="flex-1"
            >
              Edit
            </UButton>
            <UButton
              :to="`/recipe/${video.id}`"
              size="sm"
              variant="soft"
              icon="i-ph-eye"
              class="flex-1"
            >
              View
            </UButton>
            <UButton
              size="sm"
              variant="ghost"
              color="error"
              icon="i-ph-trash"
              @click="handleDelete(video.id)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
