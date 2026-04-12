<script setup lang="ts">
import type { Segment, SkeletalLogicSegmentAnalysis, SegmentVisualAnalysis } from '~/types'
import { highlightPlaceholders } from '~/utils/highlightPlaceholders'

const props = defineProps<{
  segment: Segment
  segmentIndex: number
  skeletalLogicSegment: SkeletalLogicSegmentAnalysis | null
  visualSegment?: SegmentVisualAnalysis | null
  active?: boolean
}>()

const emit = defineEmits<{
  seek: [time: number]
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

const userToggled = ref(false)
const manualOpen = ref(false)
const open = computed(() => userToggled.value ? manualOpen.value : !!props.active)
function toggle() {
  manualOpen.value = !open.value
  userToggled.value = true
}
watch(() => props.active, () => {
  userToggled.value = false
})

const hasVisual = computed(() => {
  const v = props.visualSegment
  if (!v) return false
  return Boolean(
    v.camera_movements?.length ||
    v.shot_types?.length ||
    v.color_grading?.dominant_colors?.length ||
    v.color_grading?.mood ||
    v.color_grading?.style ||
    v.scene_composition ||
    v.text_overlays?.items?.length ||
    v.transitions ||
    v.visual_pacing ||
    v.detected_visual_tags?.length
  )
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
    <button
      type="button"
      class="w-full flex items-center gap-3 px-3 py-2 text-left"
      :disabled="!segment.script_blueprint && !hasVisual"
      @click="toggle"
    >
      <span
        class="text-[10px] font-mono tabular-nums text-neutral-300 w-5 shrink-0"
      >
        {{ String(segmentIndex + 1).padStart(2, '0') }}
      </span>
      <span class="inline-flex h-1.5 w-1.5 rounded-full shrink-0" :class="theme.dot" />
      <span
        class="text-[11px] font-medium tracking-wide uppercase shrink-0"
        :class="theme.text"
      >
        {{ segment.label }}
      </span>
      <span class="text-[11px] text-neutral-800 font-bold tabular-nums shrink-0">{{ timeRange }}</span>
      <p
        v-if="skeletalLogicSegment?.goal"
        class="flex-1 min-w-0 text-[13px] text-neutral-600 truncate"
        :title="skeletalLogicSegment.goal"
      >
        {{ skeletalLogicSegment.goal }}
      </p>
      <UIcon
        v-if="segment.script_blueprint || hasVisual"
        name="i-ph-caret-right"
        class="w-3 h-3 text-neutral-400 shrink-0 transition-transform duration-200"
        :class="open ? 'rotate-90' : ''"
      />
      <UButton
        icon="i-ph-play-circle"
        size="xs"
        variant="ghost"
        color="neutral"
        class="shrink-0"
        @click.stop="emit('seek', segment.start_time)"
      />
    </button>

    <div
      v-if="segment.script_blueprint || hasVisual"
      class="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
      :class="open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
    >
      <div class="overflow-hidden min-h-0">
        <div
          v-if="segment.script_blueprint"
          class="px-3 pb-3 pt-1 border-t border-neutral-100"
        >
          <div class="relative">
            <div
              class="font-mono text-[13px] leading-relaxed bg-neutral-50/80 rounded-lg p-3 ring-1 ring-neutral-100 whitespace-pre-wrap text-neutral-600"
              v-html="highlightPlaceholders(segment.script_blueprint)"
            />
            <UButton
              :icon="copied ? 'i-ph-check' : 'i-ph-copy-simple'"
              size="xs"
              variant="ghost"
              color="neutral"
              class="absolute top-1.5 right-1.5"
              :class="copied ? 'text-emerald-500!' : ''"
              :aria-label="copied ? 'Copied' : 'Copy script'"
              @click.stop="copyBlueprint"
            />
          </div>
        </div>

        <div
          v-if="hasVisual && visualSegment"
          class="px-3 pb-3 pt-1 space-y-2 text-[12px] text-neutral-600"
          :class="!segment.script_blueprint ? 'border-t border-neutral-100' : ''"
        >
          <div v-if="visualSegment.text_overlays?.items?.length">
            <span class="text-[10px] uppercase tracking-wide text-neutral-700 font-bold">Text overlays</span>
            <ul class="mt-1 space-y-0.5">
              <li v-for="(t, i) in visualSegment.text_overlays.items" :key="i">
                <span class="font-medium">“{{ t.text }}”</span>
                <span v-if="t.style || t.position" class="text-neutral-400">
                  — {{ [t.style, t.position].filter(Boolean).join(', ') }}
                </span>
              </li>
            </ul>
          </div>

          <div v-if="visualSegment.transitions">
            <span class="text-[10px] uppercase tracking-wide text-neutral-700 font-bold">Transition</span>
            <span class="ml-1.5">{{ visualSegment.transitions.type }}</span>
            <span v-if="visualSegment.transitions.description" class="text-neutral-400"> — {{ visualSegment.transitions.description }}</span>
          </div>

          <div v-if="visualSegment.visual_pacing">
            <span class="text-[10px] uppercase tracking-wide text-neutral-700 font-bold">Pacing</span>
            <span class="ml-1.5">{{ visualSegment.visual_pacing }}</span>
          </div>

          <div v-if="visualSegment.scene_composition" class="text-neutral-500">
            <span class="text-[10px] uppercase tracking-wide text-neutral-700 font-bold">Composition</span>
            <span class="ml-1.5">{{ visualSegment.scene_composition }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
