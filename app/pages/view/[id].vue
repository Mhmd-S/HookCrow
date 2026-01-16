<script setup lang="ts">
import type { VideoWithSegments, Segment, LogicFlow } from '~/types'

const route = useRoute()
const videoId = route.params.id as string

const { fetchVideo, getVideoUrl } = useVideos()
const { logicFlows, fetchLogicFlows } = useLogicFlows()

const video = ref<VideoWithSegments | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const currentSegment = ref<Segment | null>(null)

async function loadVideo() {
  loading.value = true
  error.value = null

  await fetchLogicFlows()

  const { data, error: err } = await fetchVideo(videoId)
  if (err || !data) {
    error.value = err?.message || 'Video not found'
    loading.value = false
    return
  }

  video.value = data
  loading.value = false
}

function handleSegmentChange(segment: Segment | null) {
  currentSegment.value = segment
}

onMounted(loadVideo)

const videoUrl = computed(() =>
  video.value ? getVideoUrl(video.value.video_path) : ''
)

const logicFlow = computed<LogicFlow | null>(() => {
  if (!video.value?.logic_flow_id) return null
  return logicFlows.value.find(lf => lf.id === video.value?.logic_flow_id) || null
})
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-neutral-400" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="max-w-md mx-auto py-20 px-4 text-center">
      <UAlert color="error" :title="error" />
      <UButton to="/" class="mt-4" variant="soft">
        Back to Dashboard
      </UButton>
    </div>

    <!-- Main Content -->
    <div v-else-if="video" class="flex flex-col lg:flex-row min-h-screen">
      <!-- Left: Video Player -->
      <div class="lg:w-[400px] lg:shrink-0 bg-black">
        <div class="sticky top-0">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 bg-neutral-900">
            <UButton to="/" variant="ghost" color="white" icon="i-ph-arrow-left" size="sm">
              Back
            </UButton>
            <UButton
              :to="`/anatomize/${videoId}`"
              variant="ghost"
              color="white"
              icon="i-ph-pencil"
              size="sm"
            >
              Edit
            </UButton>
          </div>

          <!-- Player -->
          <VideoPlayer
            :src="videoUrl"
            :segments="video.segments"
            @segment-change="handleSegmentChange"
          />
        </div>
      </div>

      <!-- Right: Blueprint Sidecar -->
      <div class="flex-1 bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800">
        <ViewerBlueprintSidecar
          :video="video"
          :current-segment="currentSegment"
          :logic-flow="logicFlow"
        />
      </div>
    </div>
  </div>
</template>
