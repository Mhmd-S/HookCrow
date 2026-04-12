<script setup lang="ts">
import type { Segment, SkeletalLogicSegmentAnalysis, SegmentVisualAnalysis } from '~/types'
import { highlightPlaceholders } from '~/utils/highlightPlaceholders'

const props = defineProps<{
  segment: Segment
  segmentIndex: number
  skeletalLogicSegment: SkeletalLogicSegmentAnalysis | null
  visualSegment?: SegmentVisualAnalysis | null
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

const scriptOpen = ref(false)
function toggleScript() {
  scriptOpen.value = !scriptOpen.value
}

const visualOpen = ref(false)
function toggleVisual() {
  visualOpen.value = !visualOpen.value
}

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
    v.branding_elements?.length ||
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
    <div class="flex items-center gap-3 px-3 py-2">
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
      <span class="text-[11px] text-neutral-400 font-mono tabular-nums shrink-0">{{ timeRange }}</span>
      <p
        v-if="skeletalLogicSegment?.goal"
        class="flex-1 min-w-0 text-[13px] text-neutral-600 truncate"
        :title="skeletalLogicSegment.goal"
      >
        {{ skeletalLogicSegment.goal }}
      </p>
      <UButton
        icon="i-ph-play-circle"
        size="xs"
        variant="ghost"
        color="neutral"
        class="shrink-0"
        @click="emit('seek', segment.start_time)"
      />
    </div>

    <div
      v-if="segment.script_blueprint || hasVisual"
      class="px-3 pb-2 flex items-center gap-3 text-[11px] border-t border-neutral-100 pt-2"
    >
      <button
        v-if="segment.script_blueprint"
        type="button"
        class="flex items-center gap-1 font-medium uppercase tracking-wide text-neutral-400 hover:text-neutral-600 transition-colors"
        @click.stop="toggleScript"
      >
        <UIcon
          :name="scriptOpen ? 'i-ph-caret-down' : 'i-ph-caret-right'"
          class="w-3 h-3"
        />
        Script
      </button>
      <button
        v-if="hasVisual"
        type="button"
        class="flex items-center gap-1 font-medium uppercase tracking-wide text-neutral-400 hover:text-neutral-600 transition-colors"
        @click.stop="toggleVisual"
      >
        <UIcon
          :name="visualOpen ? 'i-ph-caret-down' : 'i-ph-caret-right'"
          class="w-3 h-3"
        />
        Visual
      </button>
      <UButton
        v-if="segment.script_blueprint"
        :icon="copied ? 'i-ph-check' : 'i-ph-copy-simple'"
        size="xs"
        variant="ghost"
        color="neutral"
        class="ml-auto"
        :class="copied ? 'text-emerald-500!' : ''"
        :aria-label="copied ? 'Copied' : 'Copy script'"
        @click.stop="copyBlueprint"
      />
    </div>

    <div
      v-if="scriptOpen && segment.script_blueprint"
      class="px-3 pb-3"
    >
      <div
        class="font-mono text-[13px] leading-relaxed bg-neutral-50/80 rounded-lg p-3 ring-1 ring-neutral-100 whitespace-pre-wrap text-neutral-600"
        v-html="highlightPlaceholders(segment.script_blueprint)"
      />
    </div>

    <div
      v-if="visualOpen && visualSegment"
      class="px-3 pb-3 space-y-2 text-[12px] text-neutral-600"
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

      <div v-if="visualSegment.detected_visual_tags?.length" class="flex flex-wrap gap-1.5">
        <UBadge
          v-for="tag in visualSegment.detected_visual_tags"
          :key="tag"
          size="sm"
          color="primary"
          variant="subtle"
        >
          {{ tag }}
        </UBadge>
      </div>

      <div v-if="visualSegment.branding_elements?.length" class="text-neutral-500">
        <span class="text-[10px] uppercase tracking-wide text-neutral-400">Branding</span>
        <span class="ml-1.5">{{ visualSegment.branding_elements.join(', ') }}</span>
      </div>
    </div>
  </div>
</template>
