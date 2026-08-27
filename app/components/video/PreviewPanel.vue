<script setup lang="ts">
import type { Segment } from '~/types'

interface Props {
  videoSrc: string
  segments: Segment[]
  currentTime?: number
  duration?: number
  isEmbed?: boolean
  sourceUrl?: string
  thumbnailUrl?: string
}

const props = withDefaults(defineProps<Props>(), {
  currentTime: 0,
  duration: 0,
  isEmbed: false,
  sourceUrl: '',
  thumbnailUrl: undefined
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

function handleSeek(time: number) {
  if (props.isEmbed) return // no-op for embed rows
  playerRef.value?.seek(time)
}

function handleSegmentSeek(segment: Segment) {
  if (props.isEmbed) return
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
    <VideoTikTokEmbed
      v-if="isEmbed && sourceUrl"
      :url="sourceUrl"
      :poster="thumbnailUrl"
    />
    <VideoPlayer
      v-else
      ref="playerRef"
      :src="videoSrc"
      :segments="segments"
      @timeupdate="handleTimeUpdate"
      @durationchange="handleDurationChange"
      @segment-change="emit('segmentChange', $event)"
    />
  </div>
</template>
