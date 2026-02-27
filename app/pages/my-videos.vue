<script setup lang="ts">
import type { Video } from '~/types'

definePageMeta({ middleware: ['auth'] })

const { getVideoUrl } = useVideos()
const { authHeaders } = useAuth()

const videos = ref<Video[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function loadMyVideos() {
  loading.value = true
  error.value = null

  try {
    const headers = await authHeaders()
    const result = await $fetch<{ data: Video[] }>('/api/my-videos', { headers })
    videos.value = result.data || []
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to load videos'
  } finally {
    loading.value = false
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

onMounted(loadMyVideos)
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <h2 class="text-lg font-semibold mb-1">My Videos</h2>
    <p class="text-muted text-sm mb-6">Videos you've uploaded and analyzed</p>

    <!-- Error -->
    <UAlert v-if="error" color="error" :title="error" class="mb-6" />

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-neutral-400" />
    </div>

    <!-- Empty -->
    <div v-else-if="videos.length === 0" class="text-center py-20">
      <UIcon name="i-ph-video" class="w-16 h-16 mx-auto text-neutral-300" />
      <h3 class="mt-4 text-lg font-medium">No videos yet</h3>
      <p class="mt-2 text-muted">Upload your first video to get a recipe card</p>
      <UButton to="/upload" class="mt-6" icon="i-ph-plus">
        Upload Video
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
          <div class="absolute top-2 left-2">
            <UBadge
              :color="video.status === 'complete' ? 'success' : 'warning'"
              size="xs"
              variant="solid"
            >
              {{ video.status === 'complete' ? 'Ready' : 'Processing' }}
            </UBadge>
          </div>
        </div>

        <div class="p-3">
          <p class="text-sm font-medium line-clamp-2">
            {{ video.title || video.creator_handle || 'Untitled' }}
          </p>
          <p class="text-xs text-neutral-400 mt-1">{{ formatDate(video.created_at) }}</p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
