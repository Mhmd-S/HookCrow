<script setup lang="ts">
import type { Video, VideoStatus } from '~/types'

const { fetchVideos, deleteVideo, getVideoUrl } = useVideos()

const videos = ref<Video[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const statusFilter = ref<VideoStatus | 'all'>('all')

async function loadVideos() {
  loading.value = true
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

onMounted(loadVideos)

const filteredVideos = computed(() => {
  if (statusFilter.value === 'all') return videos.value
  return videos.value.filter(v => v.status === statusFilter.value)
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
          <h1 class="text-2xl font-bold">Video Anatomizer</h1>
          <p class="text-neutral-500 mt-1">Break down videos into repeatable templates</p>
        </div>
        <UButton to="/anatomize" icon="i-ph-plus">
          New Video
        </UButton>
      </div>

      <!-- Filter Tabs -->
      <div class="flex gap-2 mb-6">
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
        <UButton to="/anatomize" class="mt-6" icon="i-ph-plus">
          Upload Video
        </UButton>
      </div>

      <!-- Video Grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <div
          v-for="video in filteredVideos"
          :key="video.id"
          class="group bg-white dark:bg-neutral-900 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
        >
          <!-- Thumbnail -->
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
            <!-- Status Badge -->
            <div class="absolute top-2 left-2">
              <UBadge
                :color="video.status === 'complete' ? 'success' : 'warning'"
                size="xs"
                variant="solid"
              >
                {{ video.status === 'complete' ? 'Complete' : 'Draft' }}
              </UBadge>
            </div>
          </div>

          <!-- Info -->
          <div class="p-4">
            <p v-if="video.creator_handle" class="font-medium truncate">{{ video.creator_handle }}</p>
            <p v-else class="font-medium truncate text-neutral-400">No creator</p>
            <div class="flex items-center gap-2 mt-2 text-sm text-neutral-500">
              <UBadge v-if="video.platform" size="sm" color="neutral" variant="subtle">
                {{ video.platform }}
              </UBadge>
            </div>
            <p class="text-xs text-neutral-400 mt-2">
              {{ formatDate(video.created_at) }}
            </p>
          </div>

          <!-- Actions -->
          <div class="px-4 pb-4 flex gap-2">
            <UButton
              :to="`/anatomize/${video.id}`"
              size="sm"
              variant="soft"
              icon="i-ph-pencil"
              class="flex-1"
            >
              Edit
            </UButton>
            <UButton
              :to="`/view/${video.id}`"
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
