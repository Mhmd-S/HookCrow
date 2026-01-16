<script setup lang="ts">
import type { Segment } from '~/types'

const props = defineProps<{
  src: string
  segments?: Segment[]
}>()

const emit = defineEmits<{
  timeupdate: [time: number]
  durationchange: [duration: number]
  segmentChange: [segment: Segment | null]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const currentTime = ref(0)
const duration = ref(0)
const playing = ref(false)
const muted = ref(false)

const currentSegment = computed(() => {
  if (!props.segments) return null
  return props.segments.find(
    s => currentTime.value >= s.start_time && currentTime.value < s.end_time
  ) || null
})

watch(currentSegment, (segment) => {
  emit('segmentChange', segment)
})

function handleTimeUpdate() {
  if (!videoRef.value) return
  currentTime.value = videoRef.value.currentTime
  emit('timeupdate', currentTime.value)
}

function handleDurationChange() {
  if (!videoRef.value) return
  duration.value = videoRef.value.duration
  emit('durationchange', duration.value)
}

function togglePlay() {
  if (!videoRef.value) return
  if (playing.value) {
    videoRef.value.pause()
  } else {
    videoRef.value.play()
  }
  playing.value = !playing.value
}

function toggleMute() {
  if (!videoRef.value) return
  muted.value = !muted.value
  videoRef.value.muted = muted.value
}

function seek(time: number) {
  if (!videoRef.value) return
  videoRef.value.currentTime = time
  currentTime.value = time
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getSegmentColor(label: string): string {
  const colors: Record<string, string> = {
    Hook: 'bg-red-500',
    Bridge: 'bg-yellow-500',
    Value: 'bg-green-500',
    Proof: 'bg-blue-500',
    CTA: 'bg-purple-500'
  }
  return colors[label] || 'bg-neutral-500'
}

function handleProgressClick(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  seek(percent * duration.value)
}

defineExpose({ seek, currentTime, duration })
</script>

<template>
  <div class="relative bg-muted rounded-lg overflow-hidden h-full flex flex-col">
    <!-- Video -->
    <div class="relative flex-1 min-h-0">
      <video
        ref="videoRef"
        :src="src"
        class="w-full h-full object-contain"
        @timeupdate="handleTimeUpdate"
        @durationchange="handleDurationChange"
        @play="playing = true"
        @pause="playing = false"
        @ended="playing = false"
      />

      <!-- Current Segment Badge -->
      <div
        v-if="currentSegment"
        class="absolute top-4 left-4 px-3 py-1 rounded-full text-white text-sm font-medium"
        :class="getSegmentColor(currentSegment.label)"
      >
        {{ currentSegment.label }}
      </div>
    </div>

    <!-- Floating Controls -->
    <div class="absolute bottom-0 left-0 right-0 p-3 bg-inverted-to-t from-muted to-transparent">
      <!-- Control Buttons -->
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-1">
          <UButton
            :icon="playing ? 'i-ph-pause' : 'i-ph-play'"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="togglePlay"
          />
          <UButton
            :icon="muted ? 'i-ph-speaker-slash' : 'i-ph-speaker-high'"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="toggleMute"
          />
        </div>

        <span class="text-muted text-xs font-mono">
          {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
        </span>
      </div>

      <!-- Progress Bar with Segments -->
      <div
        class="relative h-1.5 bg-accented rounded-full cursor-pointer overflow-hidden"
        @click="handleProgressClick"
      >
        <!-- Segment Markers -->
        <template v-if="segments && duration > 0">
          <div
            v-for="segment in segments"
            :key="segment.id"
            class="absolute top-0 h-full z-20"
            :class="getSegmentColor(segment.label)"
            :style="{
              left: `${(segment.start_time / duration) * 100}%`,
              width: `${((segment.end_time - segment.start_time) / duration) * 100}%`
            }"
          />
        </template>

        <!-- Progress Indicator -->
        <div
          class="absolute top-0 left-0 h-full bg-primary rounded-full pointer-events-none"
          :style="{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }"
        />
      </div>
    </div>
  </div>
</template>
