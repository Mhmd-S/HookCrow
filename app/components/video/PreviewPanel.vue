<script setup lang="ts">
import type { Segment } from '~/types'

interface Props {
  videoSrc: string
  segments: Segment[]
  currentTime?: number
  duration?: number
  // Shown when videoSrc is empty (row has no hosted mp4 yet).
  posterUrl?: string
}

const props = withDefaults(defineProps<Props>(), {
  currentTime: 0,
  duration: 0,
  posterUrl: undefined
})

const emit = defineEmits<{
  'update:segments': [segments: Segment[]]
  'update:currentTime': [time: number]
  'update:duration': [duration: number]
  segmentChange: [segment: Segment | null]
}>()

const playerRef = ref<{ seek: (time: number) => void } | null>(null)
const internalCurrentTime = ref(props.currentTime)
const internalDuration = ref(props.duration)

// Find active segment based on current time
const activeSegment = computed(() => {
  return (
    props.segments.find(
      (s) =>
        internalCurrentTime.value >= s.start_time &&
        internalCurrentTime.value < s.end_time
    ) || null
  )
})

// Find active segment index
const activeSegmentIndex = computed(() => {
  if (!activeSegment.value) return null
  return props.segments.findIndex((s) => s.id === activeSegment.value?.id)
})

function handleTimeUpdate(time: number) {
  internalCurrentTime.value = time
  emit('update:currentTime', time)
}

function handleDurationChange(duration: number) {
  internalDuration.value = duration
  emit('update:duration', duration)
}

// No-op when there is no hosted video (playerRef is null).
function handleSeek(time: number) {
  playerRef.value?.seek(time)
}

function handleSegmentSeek(segment: Segment) {
  playerRef.value?.seek(segment.start_time)
}

function handleSegmentsUpdate(segments: Segment[]) {
  emit('update:segments', segments)
}

// Expose seek function for parent
defineExpose({
  seek: handleSeek
})
</script>

<template>
  <div class="h-full flex flex-col">
    <VideoPlayer
      v-if="videoSrc"
      ref="playerRef"
      :src="videoSrc"
      :segments="segments"
      @timeupdate="handleTimeUpdate"
      @durationchange="handleDurationChange"
      @segment-change="emit('segmentChange', $event)"
    />
    <!-- No mp4 in storage yet: poster + pointer to the admin video backfill. -->
    <div
      v-else
      class="relative w-full max-w-[340px] mx-auto aspect-[9/16] bg-neutral-950 rounded-lg overflow-hidden"
    >
      <img
        v-if="posterUrl"
        :src="posterUrl"
        alt="Video thumbnail"
        class="w-full h-full object-cover"
      />
      <div class="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3 bg-black/70 text-white text-xs">
        <UIcon name="i-ph-video-camera-slash" class="w-4 h-4 shrink-0" />
        <span>Video not hosted yet — run "Backfill videos" in the admin dashboard.</span>
      </div>
    </div>
  </div>
</template>
