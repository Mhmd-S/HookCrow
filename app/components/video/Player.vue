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
const railRef = ref<HTMLElement | null>(null)
const currentTime = ref(0)
const duration = ref(0)
const playing = ref(false)
const muted = ref(false)
const hovering = ref(false)
const controlsVisible = ref(true)
let idleTimer: ReturnType<typeof setTimeout> | null = null

const currentSegment = computed(() => {
  if (!props.segments) return null
  return props.segments.find(
    s => currentTime.value >= s.start_time && currentTime.value < s.end_time
  ) || null
})

watch(currentSegment, (segment) => {
  emit('segmentChange', segment)
}, { immediate: true })

type Chapter = {
  key: string
  start: number
  end: number
  label: string | null
}

const chapters = computed<Chapter[]>(() => {
  const d = duration.value
  if (!d || d <= 0) return []

  const segs = (props.segments ?? [])
    .slice()
    .sort((a, b) => a.start_time - b.start_time)

  if (segs.length === 0) {
    return [{ key: 'full', start: 0, end: d, label: null }]
  }

  const out: Chapter[] = []
  let cursor = 0
  segs.forEach((s, i) => {
    const start = Math.max(0, Math.min(s.start_time, d))
    const end = Math.max(start, Math.min(s.end_time, d))
    if (start > cursor + 0.01) {
      out.push({ key: `gap-${i}`, start: cursor, end: start, label: null })
    }
    out.push({ key: s.id, start, end, label: s.label })
    cursor = end
  })
  if (cursor < d - 0.01) {
    out.push({ key: 'tail', start: cursor, end: d, label: null })
  }
  return out
})

function chapterFillPct(chapter: Chapter): number {
  const span = chapter.end - chapter.start
  if (span <= 0) return 0
  const raw = (currentTime.value - chapter.start) / span
  return Math.max(0, Math.min(1, raw)) * 100
}

function chapterFlexBasis(chapter: Chapter): string {
  const d = duration.value || 1
  return `${((chapter.end - chapter.start) / d) * 100}%`
}

const SEGMENT_SOLID: Record<string, string> = {
  Hook: 'bg-red-500',
  Bridge: 'bg-yellow-500',
  Value: 'bg-green-500',
  Proof: 'bg-blue-500',
  CTA: 'bg-purple-500'
}
const SEGMENT_TRACK: Record<string, string> = {
  Hook: 'bg-red-500/25',
  Bridge: 'bg-yellow-500/25',
  Value: 'bg-green-500/25',
  Proof: 'bg-blue-500/25',
  CTA: 'bg-purple-500/25'
}

function chapterTrackClass(chapter: Chapter): string {
  if (!chapter.label) return 'bg-white/15'
  return SEGMENT_TRACK[chapter.label] ?? 'bg-white/20'
}
function chapterFillClass(chapter: Chapter): string {
  if (!chapter.label) return 'bg-white/80'
  return SEGMENT_SOLID[chapter.label] ?? 'bg-white/80'
}
function segmentDotClass(label: string): string {
  return SEGMENT_SOLID[label] ?? 'bg-white'
}

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
  const clamped = Math.max(0, Math.min(time, duration.value || 0))
  videoRef.value.currentTime = clamped
  currentTime.value = clamped
}

function nudge(delta: number) {
  seek(currentTime.value + delta)
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function handleRailClick(event: MouseEvent) {
  const target = railRef.value
  if (!target || !duration.value) return
  const rect = target.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  seek(percent * duration.value)
}

function bumpIdleTimer() {
  controlsVisible.value = true
  if (idleTimer) clearTimeout(idleTimer)
  if (playing.value && !hovering.value) {
    idleTimer = setTimeout(() => {
      controlsVisible.value = false
    }, 2500)
  }
}

watch(playing, (p) => {
  if (!p) {
    controlsVisible.value = true
    if (idleTimer) clearTimeout(idleTimer)
  } else {
    bumpIdleTimer()
  }
})

function onMouseEnter() {
  hovering.value = true
  bumpIdleTimer()
}
function onMouseLeave() {
  hovering.value = false
  bumpIdleTimer()
}
function onMouseMove() {
  bumpIdleTimer()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === ' ') {
    event.preventDefault()
    togglePlay()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    nudge(-5)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    nudge(5)
  }
}

onBeforeUnmount(() => {
  if (idleTimer) clearTimeout(idleTimer)
})

defineExpose({ seek, currentTime, duration })
</script>

<template>
  <div
    tabindex="0"
    class="relative bg-neutral-950 rounded-lg overflow-hidden h-full flex flex-col outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @mousemove="onMouseMove"
    @keydown="onKeydown"
  >
    <!-- Video -->
    <div class="relative flex-1 min-h-0">
      <video
        ref="videoRef"
        :src="src"
        class="w-full h-full object-contain cursor-pointer"
        @click="togglePlay"
        @timeupdate="handleTimeUpdate"
        @durationchange="handleDurationChange"
        @play="playing = true"
        @pause="playing = false"
        @ended="playing = false"
      />

      <!-- Current Segment Badge -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 -translate-y-1"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="currentSegment"
          class="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-medium backdrop-blur-md bg-black/40 ring-1 ring-white/15"
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="segmentDotClass(currentSegment.label)"
          />
          {{ currentSegment.label }}
        </div>
      </Transition>

      <!-- Center play hint (paused state) -->
      <button
        v-if="!playing && duration > 0"
        type="button"
        class="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/20 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
        @click.stop="togglePlay"
      >
        <UIcon name="i-ph-play-fill" class="w-6 h-6 translate-x-0.5" />
      </button>
    </div>

    <!-- Bottom Gradient Scrim + Controls -->
    <div
      class="absolute inset-x-0 bottom-0 pt-10 pb-3 px-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent transition-opacity duration-200"
      :class="controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'"
    >
      <!-- Chapter Progress Rail -->
      <div
        ref="railRef"
        class="group relative flex items-center h-3 cursor-pointer mb-2"
        @click="handleRailClick"
      >
        <div class="flex items-center gap-[3px] w-full h-1.5 group-hover:h-2.5 transition-[height] duration-150">
          <div
            v-for="chapter in chapters"
            :key="chapter.key"
            class="relative h-full rounded-full overflow-hidden transition-colors"
            :class="chapterTrackClass(chapter)"
            :style="{ flexBasis: chapterFlexBasis(chapter) }"
          >
            <div
              class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75 ease-linear"
              :class="chapterFillClass(chapter)"
              :style="{ width: chapterFillPct(chapter) + '%' }"
            />
          </div>
          <!-- Fallback when duration is unknown -->
          <div
            v-if="chapters.length === 0"
            class="relative h-full w-full rounded-full bg-white/15"
          />
        </div>
      </div>

      <!-- Control Row -->
      <div class="flex items-center gap-2">
        <UButton
          :icon="playing ? 'i-ph-pause-fill' : 'i-ph-play-fill'"
          variant="solid"
          color="primary"
          size="md"
          :aria-label="playing ? 'Pause' : 'Play'"
          @click="togglePlay"
        />

        <span class="text-white/85 text-[11px] font-mono tabular-nums tracking-tight select-none">
          {{ formatTime(currentTime) }}
          <span class="text-white/40 mx-0.5">/</span>
          {{ formatTime(duration) }}
        </span>

        <div class="flex-1" />

        <UButton
          :icon="muted ? 'i-ph-speaker-slash-fill' : 'i-ph-speaker-high-fill'"
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-label="muted ? 'Unmute' : 'Mute'"
          class="text-white/80 hover:text-white"
          @click="toggleMute"
        />
      </div>
    </div>
  </div>
</template>
