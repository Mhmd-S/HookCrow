<script setup lang="ts">
import type { Segment } from '~/types'

const props = defineProps<{
  segments: Segment[]
  activeId?: string | null
  // Playhead position in seconds; omitted when there is no playable video.
  currentTime?: number | null
  // Thin variant without the time axis, for the docked mini-player.
  compact?: boolean
}>()

const emit = defineEmits<{
  jump: [segment: Segment]
}>()

const SEGMENT_COLORS: Record<string, string> = {
  Hook: 'bg-red-500',
  Bridge: 'bg-yellow-500',
  Value: 'bg-green-500',
  Proof: 'bg-blue-500',
  CTA: 'bg-purple-500'
}
// Same hues, receded, for the blocks that are not playing. A tint with dark
// text stays readable where a faded solid block with white text does not.
const SEGMENT_TINTS: Record<string, string> = {
  Hook: 'bg-red-100 text-red-700',
  Bridge: 'bg-yellow-100 text-yellow-800',
  Value: 'bg-green-100 text-green-800',
  Proof: 'bg-blue-100 text-blue-700',
  CTA: 'bg-purple-100 text-purple-700'
}

const total = computed(() => {
  const last = props.segments[props.segments.length - 1]
  return last ? Math.max(last.end_time ?? 0, 1) : 1
})

interface Block {
  segment: Segment
  grow: number
  color: string
  tint: string
  showLabel: boolean
}

// Blocks grow in proportion to their real duration. The min-width in the
// template keeps very short beats tappable without overflowing the bar.
const blocks = computed<Block[]>(() =>
  props.segments.map((segment) => {
    const dur = Math.max((segment.end_time ?? 0) - (segment.start_time ?? 0), 0)
    const share = (dur / total.value) * 100
    return {
      segment,
      grow: Math.max(share, 0.5),
      color: SEGMENT_COLORS[segment.label] || 'bg-neutral-400',
      tint: SEGMENT_TINTS[segment.label] || 'bg-neutral-100 text-neutral-700',
      showLabel: share >= 14
    }
  })
)

// Playhead offset inside the block it falls in, so it lines up with the
// drawn blocks even where min-width stretched a short one.
function playheadPct(segment: Segment): number | null {
  const t = props.currentTime
  if (t == null || t < segment.start_time || t >= segment.end_time) return null
  const span = segment.end_time - segment.start_time
  return span > 0 ? ((t - segment.start_time) / span) * 100 : 0
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <div v-if="segments.length > 0">
    <!-- The ad's shape, to scale: block widths are the real segment durations. -->
    <div
      class="flex w-full rounded-lg overflow-hidden gap-px"
      :class="compact ? 'h-8' : 'h-11'"
    >
      <button
        v-for="b in blocks"
        :key="b.segment.id"
        type="button"
        class="relative h-full min-w-7 transition-[opacity,filter,background-color] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
        :class="activeId && activeId !== b.segment.id
          ? [b.tint, 'hover:brightness-95']
          : [b.color, 'text-white hover:opacity-90']"
        :style="{ flex: `${b.grow} 1 0%` }"
        :title="`${b.segment.label} · ${formatTime(b.segment.start_time)}–${formatTime(b.segment.end_time)}`"
        :aria-label="`Go to ${b.segment.label} segment, ${formatTime(b.segment.start_time)} to ${formatTime(b.segment.end_time)}`"
        @click="emit('jump', b.segment)"
      >
        <span
          class="absolute inset-0 flex items-center justify-center font-semibold uppercase tracking-wider"
          :class="compact ? 'text-[10px]' : 'text-[11px]'"
        >
          {{ b.showLabel ? b.segment.label : b.segment.label.charAt(0) }}
        </span>
        <!-- Playhead -->
        <span
          v-if="playheadPct(b.segment) !== null"
          class="absolute inset-y-0 w-0.5 -ml-px bg-neutral-900/85 pointer-events-none transition-[left] duration-200 ease-linear"
          :style="{ left: `${playheadPct(b.segment)}%` }"
        />
      </button>
    </div>
    <div v-if="!compact" class="flex justify-between mt-1.5 text-[11px] tabular-nums text-dimmed">
      <span>0s</span>
      <span>{{ formatTime(total) }}</span>
    </div>
  </div>
</template>
