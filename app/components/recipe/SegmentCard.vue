<script setup lang="ts">
import type { Segment, SkeletalLogicSegmentAnalysis, SegmentVisualAnalysis } from '~/types'
import { highlightPlaceholders } from '~/utils/highlightPlaceholders'

const props = defineProps<{
  segment: Segment
  segmentIndex: number
  skeletalLogicSegment: SkeletalLogicSegmentAnalysis | null
  visualSegment?: SegmentVisualAnalysis | null
  active?: boolean
  seekable?: boolean
}>()

const emit = defineEmits<{
  seek: [time: number]
}>()

const segmentThemes: Record<string, { rail: string; text: string; chipBg: string }> = {
  Hook: { rail: 'bg-red-500', text: 'text-red-600', chipBg: 'bg-red-50' },
  Bridge: { rail: 'bg-yellow-500', text: 'text-yellow-600', chipBg: 'bg-yellow-50' },
  Value: { rail: 'bg-green-500', text: 'text-green-600', chipBg: 'bg-green-50' },
  Proof: { rail: 'bg-blue-500', text: 'text-blue-600', chipBg: 'bg-blue-50' },
  CTA: { rail: 'bg-purple-500', text: 'text-purple-600', chipBg: 'bg-purple-50' }
}
const fallbackTheme = { rail: 'bg-neutral-400', text: 'text-neutral-600', chipBg: 'bg-neutral-50' }
const theme = computed(() => segmentThemes[props.segment.label] || fallbackTheme)

function formatTime(seconds: number): string {
  if (seconds == null || isNaN(seconds)) return '0s'
  const t = Math.round(seconds * 10) / 10
  if (t < 60) return `${t}s`
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const timeRange = computed(() => {
  const start = formatTime(props.segment.start_time)
  const end = formatTime(props.segment.end_time)
  return start === end ? start : `${start} – ${end}`
})

const transcript = computed(() => (props.segment.transcript_raw || '').trim())
const blueprint = computed(() => (props.segment.script_blueprint || '').trim())

// Silent segments (no speech): the visual notes ARE the content, not a footer.
const visualNotes = computed(() => {
  const v = props.visualSegment
  if (!v) return []
  const notes: Array<{ label: string; text: string }> = []
  if (v.text_overlays?.items?.length) {
    notes.push({ label: 'On-screen text', text: v.text_overlays.items.map(t => `“${t.text}”`).join(' · ') })
  }
  if (v.scene_composition) notes.push({ label: 'Shot', text: v.scene_composition })
  if (v.transitions?.type) {
    notes.push({ label: 'Transition', text: v.transitions.description ? `${v.transitions.type} — ${v.transitions.description}` : v.transitions.type })
  }
  if (v.visual_pacing) notes.push({ label: 'Pacing', text: v.visual_pacing })
  return notes
})

const copied = ref(false)
function copyBlueprint() {
  if (!blueprint.value) return
  navigator.clipboard.writeText(blueprint.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <article
    :id="`seg-${segment.id}`"
    class="relative flex rounded-xl bg-default ring-1 transition-shadow scroll-mt-24"
    :class="active ? 'ring-2 ring-accented shadow-md' : 'ring-default'"
  >
    <!-- Color rail: same hue as this segment's block in the structure bar -->
    <div class="w-1 shrink-0 rounded-l-xl" :class="theme.rail" />

    <div class="flex-1 min-w-0 p-4 space-y-3">
      <!-- Header -->
      <header class="flex items-center gap-2 flex-wrap">
        <span
          class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
          :class="[theme.text, theme.chipBg]"
        >
          {{ segment.label }}
        </span>
        <component
          :is="seekable ? 'button' : 'span'"
          class="text-xs tabular-nums text-muted"
          :class="seekable ? 'hover:text-default hover:underline cursor-pointer' : ''"
          v-bind="seekable ? { type: 'button', 'aria-label': `Play from ${timeRange}` } : {}"
          @click="seekable && emit('seek', segment.start_time)"
        >
          {{ timeRange }}
        </component>
        <p v-if="skeletalLogicSegment?.goal" class="flex-1 min-w-0 text-xs text-dimmed truncate" :title="skeletalLogicSegment.goal">
          {{ skeletalLogicSegment.goal }}
        </p>
      </header>

      <!-- Two lanes: what runs in the ad, and the reusable version -->
      <div v-if="transcript || blueprint" class="grid gap-3" :class="transcript && blueprint ? 'md:grid-cols-2' : ''">
        <div v-if="transcript">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-dimmed mb-1.5">What they say</p>
          <blockquote class="text-sm leading-relaxed text-toned">
            “{{ transcript }}”
          </blockquote>
        </div>
        <div v-if="blueprint" class="relative">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-dimmed mb-1.5">Make it yours</p>
          <div
            class="font-mono text-[13px] leading-relaxed bg-muted rounded-lg p-3 pr-9 ring-1 ring-default whitespace-pre-wrap text-toned"
            v-html="highlightPlaceholders(blueprint)"
          />
          <UButton
            :icon="copied ? 'i-ph-check' : 'i-ph-copy-simple'"
            size="xs"
            variant="ghost"
            color="neutral"
            class="absolute top-6 right-1.5"
            :class="copied ? 'text-success!' : ''"
            :aria-label="copied ? 'Copied' : 'Copy this segment'"
            @click="copyBlueprint"
          />
        </div>
      </div>

      <!-- Silent segment: visuals carry it -->
      <div v-if="visualNotes.length" class="space-y-1" :class="transcript || blueprint ? 'pt-2 border-t border-muted' : ''">
        <p v-for="note in visualNotes" :key="note.label" class="text-xs text-muted leading-relaxed">
          <span class="font-semibold text-dimmed uppercase tracking-wide text-[10px]">{{ note.label }}</span>
          <span class="ml-1.5">{{ note.text }}</span>
        </p>
      </div>

      <p v-if="!transcript && !blueprint && !visualNotes.length" class="text-xs text-dimmed italic">
        No script for this segment — it plays visually.
      </p>
    </div>
  </article>
</template>
