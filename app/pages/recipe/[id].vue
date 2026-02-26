<script setup lang="ts">
import type { VideoWithSegments, Segment, LogicFlow, SkeletalLogicAnalysis, VideoVisualAnalysis, VideoAudioAnalysis, SegmentVisualAnalysis, SkeletalLogicSegmentAnalysis, MusicTrack, SoundEffect } from '~/types'

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

const logicFlow = computed<LogicFlow | null>(() =>
  (video.value as any)?.logic_flow ?? null
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

// Get skeletal logic segment matching by index
function getSkeletalSegment(index: number): SkeletalLogicSegmentAnalysis | null {
  return skeletalLogic.value?.segments?.[index] ?? null
}

// Get visual analysis segment matching by index
function getVisualSegment(index: number): SegmentVisualAnalysis | null {
  return visualAnalysis.value?.segments?.[index] ?? null
}

// Get music tracks overlapping a segment's time range
function getMusicTracks(segment: Segment): MusicTrack[] {
  if (!audioAnalysis.value?.metadata?.music?.tracks) return []
  return audioAnalysis.value.metadata.music.tracks.filter(
    t => t.start_time < segment.end_time && t.end_time > segment.start_time
  )
}

// Get sound effects overlapping a segment's time range
function getSoundEffects(segment: Segment): SoundEffect[] {
  if (!audioAnalysis.value?.metadata?.sound_effects) return []
  return audioAnalysis.value.metadata.sound_effects.filter(
    s => s.start_time < segment.end_time && s.end_time > segment.start_time
  )
}
</script>

<template>
  <div class="min-h-screen bg-neutral-50">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-neutral-400" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="max-w-md mx-auto py-20 px-4 text-center">
      <UAlert color="error" :title="error" />
      <UButton to="/" class="mt-4" variant="soft">
        Back to Library
      </UButton>
    </div>

    <!-- Recipe Card Content -->
    <div v-else-if="video" class="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <!-- Back -->
      <UButton to="/" variant="ghost" icon="i-ph-arrow-left" size="sm">
        Back to Library
      </UButton>

      <!-- Section 1: Hero -->
      <RecipeHero
        :video="video"
        :video-url="videoUrl"
        @segment-change="(s) => currentSegment = s"
      />

      <!-- Section 2: Quick Summary -->
      <RecipeSummary
        :logic-flow="logicFlow"
        :skeletal-logic="skeletalLogic"
        :visual-analysis="visualAnalysis"
        :audio-analysis="audioAnalysis"
      />

      <!-- Section 3: Full Script Template -->
      <RecipeScriptTemplate :blueprint="video.script_blueprint" />

      <!-- Section 4: Step-by-Step Segments -->
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

      <!-- Section 5: Production Notes -->
      <RecipeProductionNotes
        :visual-analysis="visualAnalysis"
        :audio-analysis="audioAnalysis"
        :skeletal-logic="skeletalLogic"
      />
    </div>
  </div>
</template>
