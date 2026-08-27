<script setup lang="ts">
import type { Segment } from '~/types'

const props = defineProps<{
  segments: Segment[]
  activeId?: string | null
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

const total = computed(() => {
  const last = props.segments[props.segments.length - 1]
  return last ? Math.max(last.end_time ?? 0, 1) : 1
})

interface Block {
  segment: Segment
  widthPct: number
  color: string
  showLabel: boolean
}

const blocks = computed<Block[]>(() =>
  props.segments.map((segment) => {
    const dur = Math.max((segment.end_time ?? 0) - (segment.start_time ?? 0), 0)
    const widthPct = Math.max((dur / total.value) * 100, 3)
    return {
      segment,
      widthPct,
      color: SEGMENT_COLORS[segment.label] || 'bg-neutral-400',
      showLabel: widthPct >= 14
    }
  })
)

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
    <div class="flex w-full h-9 rounded-lg overflow-hidden gap-px">
      <button
        v-for="b in blocks"
        :key="b.segment.id"
        type="button"
        class="relative h-full transition-opacity"
        :class="[
          b.color,
          activeId && activeId !== b.segment.id ? 'opacity-40 hover:opacity-80' : 'hover:opacity-90'
        ]"
        :style="{ width: `${b.widthPct}%` }"
        :title="`${b.segment.label} · ${formatTime(b.segment.start_time)}–${formatTime(b.segment.end_time)}`"
        :aria-label="`Go to ${b.segment.label} segment`"
        @click="emit('jump', b.segment)"
      >
        <span
          class="absolute inset-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wider text-white/95"
        >
          {{ b.showLabel ? b.segment.label : b.segment.label.charAt(0) }}
        </span>
      </button>
    </div>
    <div class="flex justify-between mt-1 text-[10px] tabular-nums text-dimmed">
      <span>0s</span>
      <span>{{ formatTime(total) }}</span>
    </div>
  </div>
</template>
