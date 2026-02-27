<script setup lang="ts">
import type { VideoWithSegments, Segment, SkeletalLogicAnalysis, VideoVisualAnalysis, VideoAudioAnalysis, SegmentVisualAnalysis, SkeletalLogicSegmentAnalysis, MusicTrack, SoundEffect } from '~/types'

const route = useRoute()
const videoId = route.params.id as string

const { getVideoUrl } = useVideos()
const { authHeaders } = useAuth()

const video = ref<VideoWithSegments | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const currentSegment = ref<Segment | null>(null)

async function loadRecipe() {
  loading.value = true
  error.value = null

  try {
    const headers = await authHeaders()
    const result = await $fetch<{ data: VideoWithSegments }>(`/api/recipe/${videoId}`, { headers })
    video.value = result.data
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Recipe not found'
  } finally {
    loading.value = false
  }
}

onMounted(loadRecipe)

const videoUrl = computed(() =>
  video.value ? getVideoUrl(video.value.video_path) : ''
)

const skeletalLogic = computed<SkeletalLogicAnalysis | null>(() =>
  video.value?.skeletal_logic as unknown as SkeletalLogicAnalysis ?? null
)

const visualAnalysis = computed<VideoVisualAnalysis | null>(() =>
  (video.value as any)?.visual_analysis ?? null
)

const audioAnalysis = computed<VideoAudioAnalysis | null>(() =>
  (video.value as any)?.audio_analysis ?? null
)

function getSkeletalSegment(index: number): SkeletalLogicSegmentAnalysis | null {
  return skeletalLogic.value?.segments?.[index] ?? null
}

function getVisualSegment(index: number): SegmentVisualAnalysis | null {
  return visualAnalysis.value?.segments?.[index] ?? null
}

function getMusicTracks(segment: Segment): MusicTrack[] {
  if (!audioAnalysis.value?.metadata?.music?.tracks) return []
  return audioAnalysis.value.metadata.music.tracks.filter(
    t => t.start_time < segment.end_time && t.end_time > segment.start_time
  )
}

function getSoundEffects(segment: Segment): SoundEffect[] {
  if (!audioAnalysis.value?.metadata?.sound_effects) return []
  return audioAnalysis.value.metadata.sound_effects.filter(
    s => s.start_time < segment.end_time && s.end_time > segment.start_time
  )
}
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-neutral-400" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="max-w-md mx-auto py-20 px-4 text-center">
      <UAlert color="error" :title="error" />
      <UButton to="/" class="mt-4" variant="soft">
        Back to Library
      </UButton>
    </div>

    <!-- Recipe Card Content — side-by-side layout -->
    <div v-else-if="video" class="flex gap-6 p-6 max-w-7xl mx-auto">
      <!-- Left column: scrollable content -->
      <div class="flex-1 min-w-0 space-y-6">
        <!-- Title + Meta -->
        <RecipeHero :video="video" />

        <!-- Full Script Template -->
        <RecipeScriptTemplate :blueprint="video.script_blueprint" />

        <!-- Step-by-Step Segments -->
        <div v-if="video.segments.length > 0">
          <h2 class="text-lg font-semibold text-default mb-3">Step-by-Step Breakdown</h2>
          <div class="space-y-4">
            <RecipeSegmentCard
              v-for="(segment, index) in video.segments"
              :key="segment.id"
              :segment="segment"
              :segment-index="index"
              :skeletal-logic-segment="getSkeletalSegment(index)"
              :visual-segment="getVisualSegment(index)"
              :music-tracks="getMusicTracks(segment)"
              :sound-effects="getSoundEffects(segment)"
            />
          </div>
        </div>
      </div>

      <!-- Right column: sticky video player -->
      <div class="hidden lg:block w-75 shrink-0">
        <div class="sticky top-6">
          <div class="aspect-9/16 bg-black rounded-lg overflow-hidden">
            <VideoPlayer
              :src="videoUrl"
              :segments="video.segments"
              @segment-change="(s: Segment | null) => currentSegment = s"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
