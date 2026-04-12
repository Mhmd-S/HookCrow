<script setup lang="ts">
import type { Segment, SkeletalLogicSegmentAnalysis } from '~/types'
import { highlightPlaceholders } from '~/utils/highlightPlaceholders'

const props = defineProps<{
  segment: Segment
  segmentIndex: number
  skeletalLogicSegment: SkeletalLogicSegmentAnalysis | null
}>()

const segmentThemes: Record<string, { accent: string; bg: string; text: string; dot: string; badge: string }> = {
  Hook: { accent: 'ring-red-500/30', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500', badge: 'error' },
  Bridge: { accent: 'ring-amber-500/30', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500', badge: 'warning' },
  Value: { accent: 'ring-emerald-500/30', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500', badge: 'success' },
  Proof: { accent: 'ring-blue-500/30', bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500', badge: 'info' },
  CTA: { accent: 'ring-violet-500/30', bg: 'bg-violet-50', text: 'text-violet-600', dot: 'bg-violet-500', badge: 'secondary' }
}

const fallbackTheme = { accent: 'ring-neutral-500/30', bg: 'bg-neutral-50', text: 'text-neutral-600', dot: 'bg-neutral-400', badge: 'neutral' }

const theme = computed(() => segmentThemes[props.segment.label] || fallbackTheme)

function formatTime(seconds: number): string {
  if (seconds == null || isNaN(seconds)) return '0s'
  const totalSeconds = Math.round(seconds * 10) / 10
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const timeRange = computed(() => {
  const start = formatTime(props.segment.start_time)
  const end = formatTime(props.segment.end_time)
  if (start === end) return start
  return `${start} – ${end}`
})

const copied = ref(false)
function copyBlueprint() {
  if (!props.segment.script_blueprint) return
  navigator.clipboard.writeText(props.segment.script_blueprint)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div
    class="group relative rounded-xl bg-white ring-1 ring-neutral-200/80 hover:ring-2 transition-all duration-200"
    :class="theme.accent"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3.5">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="relative flex h-2 w-2">
            <span
              class="absolute inline-flex h-full w-full rounded-full opacity-40 animate-ping"
              :class="theme.dot"
            />
            <span class="relative inline-flex h-2 w-2 rounded-full" :class="theme.dot" />
          </span>
          <span class="text-xs font-medium tracking-wide uppercase" :class="theme.text">
            {{ segment.label }}
          </span>
        </div>
        <span class="text-[11px] text-neutral-400 font-mono tabular-nums">{{ timeRange }}</span>
      </div>
      <span
        class="text-[10px] font-semibold tracking-widest uppercase text-neutral-300"
      >
        {{ String(segmentIndex + 1).padStart(2, '0') }}
      </span>
    </div>

    <div class="px-5 pb-5 space-y-4">
      <!-- Goal -->
      <div
        v-if="skeletalLogicSegment?.goal"
        class="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5"
        :class="theme.bg"
      >
        <UIcon name="i-ph-crosshair-simple" class="w-3.5 h-3.5 shrink-0 mt-0.5" :class="theme.text" />
        <p class="text-[13px] leading-relaxed text-neutral-700">{{ skeletalLogicSegment.goal }}</p>
      </div>

      <!-- Script -->
      <div v-if="segment.script_blueprint || segment.transcript_raw">
        <div class="flex items-center justify-between mb-2.5">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-neutral-400 flex items-center gap-1.5">
            <UIcon name="i-ph-text-aa" class="w-3.5 h-3.5" />
            Script
          </h4>
          <UButton
            v-if="segment.script_blueprint"
            :icon="copied ? 'i-ph-check' : 'i-ph-copy-simple'"
            size="xs"
            variant="ghost"
            color="neutral"
            :class="copied ? 'text-emerald-500!' : ''"
            @click="copyBlueprint"
          />
        </div>
        <div
          v-if="segment.script_blueprint"
          class="font-mono text-[13px] leading-relaxed bg-neutral-50/80 rounded-lg p-4 ring-1 ring-neutral-100 whitespace-pre-wrap text-neutral-600"
          v-html="highlightPlaceholders(segment.script_blueprint)"
        />
        <p
          v-if="segment.transcript_raw"
          class="text-xs text-neutral-400 mt-3 pl-3 border-l-2 border-neutral-100 italic leading-relaxed"
        >
          {{ segment.transcript_raw }}
        </p>
      </div>
    </div>
  </div>
</template>
