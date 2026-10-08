<script setup lang="ts">
import type { Segment } from '~/types'

const props = defineProps<{
  src: string
  segments?: Segment[]
  // Still frame shown before playback starts.
  poster?: string
  // Video only, no overlay chrome — for a docked mini-player.
  minimal?: boolean
}>()

const emit = defineEmits<{
  timeupdate: [time: number]
  durationchange: [duration: number]
  segmentChange: [segment: Segment | null]
}>()

const rootRef = ref<HTMLElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const railRef = ref<HTMLElement | null>(null)
const currentTime = ref(0)
const duration = ref(0)
const playing = ref(false)
const ended = ref(false)
const buffering = ref(false)
const failed = ref(false)
const muted = ref(false)
const hovering = ref(false)
const scrubbing = ref(false)
const controlsVisible = ref(true)
let idleTimer: ReturnType<typeof setTimeout> | null = null

const currentSegment = computed(() => {
  if (!props.segments) return null
  return props.segments.find(
    s => currentTime.value >= s.start_time && currentTime.value < s.end_time
  ) || null
})

// No initial emit during SSR: the parent has already rendered part of its
// markup by then, and a state change mid-render breaks hydration.
watch(currentSegment, (segment) => {
  emit('segmentChange', segment)
}, { immediate: !import.meta.server })

// A new source starts from a clean slate.
watch(() => props.src, () => {
  failed.value = false
  ended.value = false
  buffering.value = false
})

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

const progressPct = computed(() =>
  duration.value > 0 ? Math.min(1, currentTime.value / duration.value) * 100 : 0
)

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

function onPlay() {
  playing.value = true
  ended.value = false
}
function onPause() {
  playing.value = false
  buffering.value = false
}
function onEnded() {
  playing.value = false
  ended.value = true
}

// `playing` follows the element's own play/pause events, so a play() the
// browser rejects (autoplay policy, bad source) never leaves the UI out of sync.
function play() {
  videoRef.value?.play()?.catch(() => {})
}

function pause() {
  videoRef.value?.pause()
}

function togglePlay() {
  if (!videoRef.value) return
  if (videoRef.value.paused) play()
  else pause()
}

function toggleMute() {
  if (!videoRef.value) return
  muted.value = !muted.value
  videoRef.value.muted = muted.value
}

// Root fullscreen keeps our chapter rail; iOS Safari only allows the
// native video fullscreen.
function toggleFullscreen() {
  const root = rootRef.value
  const video = videoRef.value as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
  if (!root || !video) return
  if (document.fullscreenElement) {
    document.exitFullscreen?.()
  } else if (root.requestFullscreen) {
    root.requestFullscreen().catch(() => video.webkitEnterFullscreen?.())
  } else {
    video.webkitEnterFullscreen?.()
  }
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

// Rail scrubbing: pointer events cover mouse clicks, drags and touch drags.
function seekToPointer(event: PointerEvent) {
  const target = railRef.value
  if (!target || !duration.value) return
  const rect = target.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  seek(percent * duration.value)
}

function onRailPointerDown(event: PointerEvent) {
  scrubbing.value = true
  railRef.value?.setPointerCapture(event.pointerId)
  seekToPointer(event)
  bumpIdleTimer()
}
function onRailPointerMove(event: PointerEvent) {
  if (scrubbing.value) seekToPointer(event)
}
function onRailPointerUp(event: PointerEvent) {
  if (!scrubbing.value) return
  scrubbing.value = false
  railRef.value?.releasePointerCapture(event.pointerId)
  bumpIdleTimer()
}

function bumpIdleTimer() {
  controlsVisible.value = true
  if (idleTimer) clearTimeout(idleTimer)
  if (playing.value && !hovering.value) {
    idleTimer = setTimeout(() => {
      if (!scrubbing.value) controlsVisible.value = false
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

// Only a mouse can hover. A touch fires pointerenter but never a matching
// leave, which would pin the controls open forever.
function onPointerEnter(event: PointerEvent) {
  if (event.pointerType === 'mouse') hovering.value = true
  bumpIdleTimer()
}
function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'mouse') hovering.value = false
  bumpIdleTimer()
}
function onPointerMove(event: PointerEvent) {
  if (event.pointerType === 'mouse') bumpIdleTimer()
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

// Server-rendered markup starts loading before hydration attaches the
// listeners, so the first durationchange (or error) can fire unseen.
onMounted(() => {
  const video = videoRef.value
  if (!video) return
  if (video.readyState >= 1) handleDurationChange()
  if (video.error) failed.value = true
})

onBeforeUnmount(() => {
  if (idleTimer) clearTimeout(idleTimer)
})

defineExpose({ seek, currentTime, duration, play, pause, togglePlay, playing })
</script>

<template>
  <div
    ref="rootRef"
    tabindex="0"
    class="relative bg-neutral-950 rounded-lg overflow-hidden h-full flex flex-col outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @pointermove="onPointerMove"
    @pointerdown="bumpIdleTimer"
    @keydown="onKeydown"
  >
    <!-- Video -->
    <div class="relative flex-1 min-h-0">
      <video
        ref="videoRef"
        :src="src"
        :poster="poster"
        preload="metadata"
        playsinline
        webkit-playsinline
        class="w-full h-full object-contain cursor-pointer"
        @click="togglePlay"
        @timeupdate="handleTimeUpdate"
        @durationchange="handleDurationChange"
        @play="onPlay"
        @pause="onPause"
        @ended="onEnded"
        @waiting="buffering = true"
        @playing="buffering = false"
        @canplay="buffering = false"
        @error="failed = true"
      />

      <template v-if="!minimal">
        <!-- Current Segment Badge -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="opacity-0 -translate-y-1"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div
            v-if="currentSegment"
            class="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-medium backdrop-blur-md bg-black/40 ring-1 ring-white/15 pointer-events-none"
          >
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="segmentDotClass(currentSegment.label)"
            />
            {{ currentSegment.label }}
          </div>
        </Transition>

        <!-- Source failed to load -->
        <div
          v-if="failed"
          class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white/80 bg-black/60"
        >
          <UIcon name="i-ph-video-camera-slash" class="w-7 h-7" />
          <p class="text-sm">This video could not be loaded.</p>
        </div>

        <!-- Buffering -->
        <div
          v-else-if="buffering && playing"
          class="absolute inset-0 m-auto w-16 h-16 flex items-center justify-center pointer-events-none"
        >
          <UIcon name="i-ph-circle-notch" class="w-9 h-9 text-white/85 animate-spin" />
        </div>

        <!-- Center play button (paused state): the big tap target on touch -->
        <button
          v-else-if="!playing"
          type="button"
          class="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/25 text-white flex items-center justify-center hover:bg-black/60 active:scale-95 transition"
          :aria-label="ended ? 'Replay' : 'Play'"
          @click.stop="togglePlay"
        >
          <UIcon
            :name="ended ? 'i-ph-arrow-counter-clockwise-bold' : 'i-ph-play-fill'"
            class="w-7 h-7"
            :class="ended ? '' : 'translate-x-0.5'"
          />
        </button>
      </template>
    </div>

    <template v-if="!minimal && !failed">
      <!-- Slim progress line while the controls are hidden -->
      <div
        v-if="!controlsVisible"
        class="absolute inset-x-0 bottom-0 h-0.5 bg-white/15 pointer-events-none"
      >
        <div class="h-full bg-white/80" :style="{ width: progressPct + '%' }" />
      </div>

      <!-- Bottom Gradient Scrim + Controls -->
      <div
        class="absolute inset-x-0 bottom-0 pt-10 pb-2 px-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent transition-opacity duration-200"
        :class="controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      >
        <!-- Chapter Progress Rail: tall hit area, thin visual track -->
        <div
          ref="railRef"
          class="group relative flex items-center h-8 px-1 cursor-pointer touch-pan-y"
          @pointerdown="onRailPointerDown"
          @pointermove="onRailPointerMove"
          @pointerup="onRailPointerUp"
          @pointercancel="onRailPointerUp"
        >
          <div
            class="flex items-center gap-[3px] w-full transition-[height] duration-150"
            :class="scrubbing ? 'h-3' : 'h-1.5 group-hover:h-2.5'"
          >
            <div
              v-for="chapter in chapters"
              :key="chapter.key"
              class="relative h-full rounded-full overflow-hidden transition-colors"
              :class="chapterTrackClass(chapter)"
              :style="{ flexBasis: chapterFlexBasis(chapter) }"
            >
              <div
                class="absolute inset-y-0 left-0 rounded-full"
                :class="[chapterFillClass(chapter), scrubbing ? '' : 'transition-[width] duration-75 ease-linear']"
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

        <!-- Control Row (a container, so narrow players can drop fullscreen) -->
        <div class="@container flex items-center gap-1">
          <UButton
            :icon="playing ? 'i-ph-pause-fill' : 'i-ph-play-fill'"
            variant="solid"
            color="primary"
            size="lg"
            class="size-11 justify-center rounded-full"
            :aria-label="playing ? 'Pause' : 'Play'"
            @click="togglePlay"
          />

          <span class="ml-1.5 text-white/90 text-xs font-medium tabular-nums whitespace-nowrap select-none">
            {{ formatTime(currentTime) }}
            <span class="text-white/45 mx-0.5">/</span>
            {{ formatTime(duration) }}
          </span>

          <div class="flex-1" />

          <UButton
            :icon="muted ? 'i-ph-speaker-slash-fill' : 'i-ph-speaker-high-fill'"
            variant="ghost"
            color="neutral"
            size="lg"
            :aria-label="muted ? 'Unmute' : 'Mute'"
            class="size-11 justify-center text-white/85 hover:text-white hover:bg-white/10 active:bg-white/15"
            @click="toggleMute"
          />
          <UButton
            icon="i-ph-corners-out"
            variant="ghost"
            color="neutral"
            size="lg"
            aria-label="Fullscreen"
            class="hidden @[15rem]:inline-flex size-11 justify-center text-white/85 hover:text-white hover:bg-white/10 active:bg-white/15"
            @click="toggleFullscreen"
          />
        </div>
      </div>
    </template>
  </div>
</template>
