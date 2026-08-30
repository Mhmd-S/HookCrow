<script setup lang="ts">
import type { Video, VideoStatus, LogicFlow, VideoUpdate } from '~/types'

definePageMeta({ layout: 'admin', middleware: ['admin'] })

useSeoMeta({
  title: 'Admin Dashboard',
  robots: 'noindex,nofollow'
})

const { fetchVideos, deleteVideo, updateVideo, getVideoUrl } = useVideos()
const { logicFlows, fetchLogicFlows } = useLogicFlows()
const { authHeaders } = useAuth()

const videos = ref<Video[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const statusFilter = ref<VideoStatus | 'all'>('all')
const accessFilter = ref<'all' | 'free' | 'premium'>('all')
const viewMode = ref<'grid' | 'grouped'>('grouped')

// Backfill state
const backfillRunning = ref(false)
const backfillStats = ref<{ processed: number; remaining: number; errors: number }>({
  processed: 0,
  remaining: 0,
  errors: 0
})

const thumbBackfillRunning = ref(false)
const thumbBackfillStats = ref<{ processed: number; remaining: number; errors: number }>({
  processed: 0,
  remaining: 0,
  errors: 0
})
const thumbBackfillMessage = ref<string | null>(null)

async function runBackfill() {
  if (backfillRunning.value) return
  backfillRunning.value = true
  backfillStats.value = { processed: 0, remaining: 0, errors: 0 }

  try {
    // Loop until remaining === 0 or 20 batches (safety cap)
    for (let i = 0; i < 20; i++) {
      const result = await $fetch<{ processed: number; remaining: number; errors: Array<{ id: string; error: string }> }>(
        '/api/admin/reembed',
        {
          method: 'POST',
          body: { batchSize: 5 },
          headers: authHeaders()
        }
      )
      backfillStats.value = {
        processed: backfillStats.value.processed + result.processed,
        remaining: result.remaining,
        errors: backfillStats.value.errors + result.errors.length
      }
      if (result.remaining === 0 || (result.processed === 0 && result.errors.length === 0)) break
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Backfill failed'
  } finally {
    backfillRunning.value = false
  }
}

async function runThumbBackfill() {
  if (thumbBackfillRunning.value) return
  thumbBackfillRunning.value = true
  thumbBackfillStats.value = { processed: 0, remaining: 0, errors: 0 }
  thumbBackfillMessage.value = null

  let firstResponse: { processed: number; remaining: number; errors: unknown[] } | null = null

  try {
    // Loop until remaining === 0 or 50 batches (videos take longer than embeddings)
    for (let i = 0; i < 50; i++) {
      const result = await $fetch<{ processed: number; remaining: number; errors: Array<{ id: string; error: string }> }>(
        '/api/admin/generate-thumbnails',
        {
          method: 'POST',
          body: { batchSize: 3 },
          headers: authHeaders()
        }
      )
      if (i === 0) firstResponse = result
      thumbBackfillStats.value = {
        processed: thumbBackfillStats.value.processed + result.processed,
        remaining: result.remaining,
        errors: thumbBackfillStats.value.errors + result.errors.length
      }
      if (result.remaining === 0 || (result.processed === 0 && result.errors.length === 0)) break
    }

    const { processed, remaining, errors } = thumbBackfillStats.value
    if (processed === 0 && errors === 0 && firstResponse?.remaining === 0) {
      thumbBackfillMessage.value = 'All videos already have thumbnails — nothing to backfill.'
    } else if (errors > 0 && processed === 0) {
      thumbBackfillMessage.value = `Failed: ${errors} errors. Check server logs (FFmpeg may not be installed).`
    } else {
      thumbBackfillMessage.value = `Done: ${processed} thumbnails generated${errors > 0 ? `, ${errors} errors` : ''}${remaining > 0 ? `, ${remaining} still pending` : ''}.`
    }
  } catch (err) {
    thumbBackfillMessage.value = err instanceof Error ? err.message : 'Thumbnail backfill failed'
  } finally {
    thumbBackfillRunning.value = false
  }
}

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

function handleToggleStatus(video: Video) {
  const original = video.status
  const next: VideoStatus = original === 'complete' ? 'draft' : 'complete'
  video.status = next
  updateVideo(video.id, { status: next }).then(({ error: err }) => {
    if (err) {
      video.status = original
      error.value = err.message
    }
  })
}

function handleTogglePremium(video: Video) {
  const original = video.is_premium
  video.is_premium = !original
  updateVideo(video.id, { is_premium: video.is_premium }).then(({ error: err }) => {
    if (err) {
      video.is_premium = original
      error.value = err.message
    }
  })
}

function handleTogglePublished(video: Video) {
  const original = video.is_published
  video.is_published = !original
  updateVideo(video.id, { is_published: video.is_published }).then(({ error: err }) => {
    if (err) {
      video.is_published = original
      error.value = err.message
    }
  })
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
  return videos.value.filter(v => {
    if (statusFilter.value !== 'all' && v.status !== statusFilter.value) return false
    if (accessFilter.value === 'premium' && !v.is_premium) return false
    if (accessFilter.value === 'free' && v.is_premium) return false
    return true
  })
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
const premiumCount = computed(() => videos.value.filter(v => v.is_premium).length)
const freeCount = computed(() => videos.value.filter(v => !v.is_premium).length)
</script>

<template>
  <div class="p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-lg font-semibold">Admin Dashboard</h2>
          <p class="text-muted text-sm mt-1">Manage and analyze videos</p>
        </div>
        <div class="flex gap-2 items-center">
          <UButton
            variant="ghost"
            size="sm"
            icon="i-ph-sparkle"
            :loading="backfillRunning"
            @click="runBackfill"
          >
            Backfill search
            <template v-if="backfillRunning || backfillStats.processed > 0">
              <span class="text-xs text-muted">
                ({{ backfillStats.processed }} done{{ backfillStats.remaining > 0 ? `, ${backfillStats.remaining} left` : '' }}{{ backfillStats.errors > 0 ? `, ${backfillStats.errors} err` : '' }})
              </span>
            </template>
          </UButton>
          <UButton
            variant="ghost"
            size="sm"
            icon="i-ph-image"
            :loading="thumbBackfillRunning"
            @click="runThumbBackfill"
          >
            Backfill thumbnails
            <template v-if="thumbBackfillRunning || thumbBackfillStats.processed > 0 || thumbBackfillStats.errors > 0">
              <span class="text-xs text-muted">
                ({{ thumbBackfillStats.processed }} done{{ thumbBackfillStats.remaining > 0 ? `, ${thumbBackfillStats.remaining} left` : '' }}{{ thumbBackfillStats.errors > 0 ? `, ${thumbBackfillStats.errors} err` : '' }})
              </span>
            </template>
          </UButton>
          <UButton to="/admin/recipes/new" variant="ghost" size="sm" icon="i-ph-plus">
            Upload Video
          </UButton>
          <UButton to="/admin/recipes/bulk" size="sm" icon="i-ph-stack">
            Bulk Upload
          </UButton>
        </div>
      </div>

      <!-- Filter Tabs & View Toggle -->
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div class="flex gap-2 flex-wrap">
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
          <div class="w-px bg-neutral-200 dark:bg-neutral-800 mx-1" />
          <UButton
            :variant="accessFilter === 'all' ? 'solid' : 'ghost'"
            size="sm"
            color="neutral"
            @click="accessFilter = 'all'"
          >
            Any access
          </UButton>
          <UButton
            :variant="accessFilter === 'free' ? 'solid' : 'ghost'"
            size="sm"
            color="neutral"
            icon="i-ph-globe"
            @click="accessFilter = 'free'"
          >
            Free ({{ freeCount }})
          </UButton>
          <UButton
            :variant="accessFilter === 'premium' ? 'solid' : 'ghost'"
            size="sm"
            color="primary"
            icon="i-ph-crown-simple"
            @click="accessFilter = 'premium'"
          >
            Pro ({{ premiumCount }})
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

      <!-- Thumbnail Backfill Result -->
      <UAlert
        v-if="thumbBackfillMessage"
        :color="thumbBackfillStats.errors > 0 && thumbBackfillStats.processed === 0 ? 'error' : 'info'"
        :title="thumbBackfillMessage"
        :close-button="{ icon: 'i-ph-x', color: 'neutral', variant: 'link' }"
        class="mb-6"
        @close="thumbBackfillMessage = null"
      />

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-neutral-400" />
      </div>

      <!-- Empty State -->
      <div v-else-if="videos.length === 0" class="text-center py-20">
        <UIcon name="i-ph-video" class="w-16 h-16 mx-auto text-neutral-300 dark:text-neutral-700" />
        <h3 class="mt-4 text-lg font-medium">No videos yet</h3>
        <p class="mt-2 text-neutral-500">Upload your first video to start building the library</p>
        <div class="mt-6 flex gap-2 justify-center">
          <UButton to="/admin/recipes/new" variant="soft" icon="i-ph-plus">
            Upload Video
          </UButton>
          <UButton to="/admin/recipes/bulk" icon="i-ph-stack">
            Bulk Upload
          </UButton>
        </div>
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
                <div class="absolute top-2 left-2 flex flex-col gap-1">
                  <UBadge
                    :color="video.status === 'complete' ? 'success' : 'warning'"
                    size="xs"
                    variant="solid"
                  >
                    {{ video.status === 'complete' ? 'Complete' : 'Draft' }}
                  </UBadge>
                  <UBadge
                    :color="video.is_premium ? 'primary' : 'neutral'"
                    :variant="video.is_premium ? 'solid' : 'subtle'"
                    size="xs"
                  >
                    <UIcon :name="video.is_premium ? 'i-ph-crown-simple' : 'i-ph-globe'" class="w-3 h-3 mr-1" />
                    {{ video.is_premium ? 'Pro' : 'Free' }}
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
                      size="xs"
                      :variant="video.is_premium ? 'soft' : 'ghost'"
                      :color="video.is_premium ? 'primary' : 'neutral'"
                      icon="i-ph-crown-simple"
                      :aria-label="video.is_premium ? 'Mark as free' : 'Mark as premium'"
                      :title="video.is_premium ? 'Premium — click to make free' : 'Free — click to make premium'"
                      @click="handleTogglePremium(video)"
                    />
                    <UButton
                      size="xs"
                      :variant="video.is_published ? 'soft' : 'ghost'"
                      :color="video.is_published ? 'success' : 'neutral'"
                      :icon="video.is_published ? 'i-ph-eye' : 'i-ph-eye-slash'"
                      :aria-label="video.is_published ? 'Unpublish' : 'Publish'"
                      :title="video.is_published ? 'Published — click to unpublish' : 'Unpublished — click to publish'"
                      @click="handleTogglePublished(video)"
                    />
                    <UButton
                      size="xs"
                      variant="ghost"
                      :color="video.status === 'complete' ? 'success' : 'warning'"
                      :icon="video.status === 'complete' ? 'i-ph-check-circle' : 'i-ph-circle-dashed'"
                      :aria-label="`Toggle status (currently ${video.status})`"
                      @click="handleToggleStatus(video)"
                    />
                    <UButton
                      :to="`/admin/recipes/${video.id}`"
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
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-ph-trash"
                      aria-label="Delete video"
                      @click="handleDelete(video.id)"
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
            <div class="absolute top-2 left-2 flex flex-col gap-1">
              <UBadge
                :color="video.status === 'complete' ? 'success' : 'warning'"
                size="xs"
                variant="solid"
              >
                {{ video.status === 'complete' ? 'Complete' : 'Draft' }}
              </UBadge>
              <UBadge
                :color="video.is_premium ? 'primary' : 'neutral'"
                :variant="video.is_premium ? 'solid' : 'subtle'"
                size="xs"
              >
                <UIcon :name="video.is_premium ? 'i-ph-crown-simple' : 'i-ph-globe'" class="w-3 h-3 mr-1" />
                {{ video.is_premium ? 'Pro' : 'Free' }}
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

          <div class="px-4 pb-4 flex gap-2 flex-wrap">
            <UButton
              :to="`/admin/recipes/${video.id}`"
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
              :variant="video.is_premium ? 'soft' : 'ghost'"
              :color="video.is_premium ? 'primary' : 'neutral'"
              icon="i-ph-crown-simple"
              :aria-label="video.is_premium ? 'Mark as free' : 'Mark as premium'"
              :title="video.is_premium ? 'Premium — click to make free' : 'Free — click to make premium'"
              @click="handleTogglePremium(video)"
            />
            <UButton
              size="sm"
              :variant="video.is_published ? 'soft' : 'ghost'"
              :color="video.is_published ? 'success' : 'neutral'"
              :icon="video.is_published ? 'i-ph-eye' : 'i-ph-eye-slash'"
              :aria-label="video.is_published ? 'Unpublish' : 'Publish'"
              :title="video.is_published ? 'Published — click to unpublish' : 'Unpublished — click to publish'"
              @click="handleTogglePublished(video)"
            />
            <UButton
              size="sm"
              variant="ghost"
              :color="video.status === 'complete' ? 'success' : 'warning'"
              :icon="video.status === 'complete' ? 'i-ph-check-circle' : 'i-ph-circle-dashed'"
              :aria-label="`Toggle status (currently ${video.status})`"
              @click="handleToggleStatus(video)"
            />
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
</template>
