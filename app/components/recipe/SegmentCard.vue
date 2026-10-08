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

// Long transcripts push the reusable script far down on a phone; fold them.
const TRANSCRIPT_FOLD = 240
const transcriptLong = computed(() => transcript.value.length > TRANSCRIPT_FOLD)
const transcriptOpen = ref(false)

// With a script to read, the visual notes are secondary: folded on phones,
// always open from md. Silent segments keep them open — they are the content.
const notesFoldable = computed(() => !!(transcript.value || blueprint.value))
const notesOpen = ref(false)

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
      <header class="space-y-1.5">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
            :class="[theme.text, theme.chipBg]"
          >
            {{ segment.label }}
          </span>
          <!-- Seek pill: the visible pill is small, the ::after hit area is 44px tall -->
          <button
            v-if="seekable"
            type="button"
            class="relative inline-flex items-center gap-1 h-7 pl-1.5 pr-2.5 rounded-full text-xs font-medium tabular-nums text-toned bg-elevated hover:bg-accented active:bg-accented transition-colors after:absolute after:-inset-y-2 after:-inset-x-1 after:content-['']"
            :aria-label="`Play from ${timeRange}`"
            @click="emit('seek', segment.start_time)"
          >
            <UIcon name="i-ph-play-fill" class="w-3.5 h-3.5" :class="theme.text" />
            {{ timeRange }}
          </button>
          <span v-else class="text-xs tabular-nums text-muted">{{ timeRange }}</span>
        </div>
        <p v-if="skeletalLogicSegment?.goal" class="text-sm text-muted leading-snug">
          {{ skeletalLogicSegment.goal }}
        </p>
      </header>

      <!-- Two lanes: what runs in the ad, and the reusable version -->
      <div v-if="transcript || blueprint" class="grid gap-4" :class="transcript && blueprint ? 'md:grid-cols-2' : ''">
        <div v-if="transcript" class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-dimmed mb-1.5">What they say</p>
          <blockquote
            class="text-[15px] md:text-sm leading-relaxed text-toned break-words"
            :class="transcriptLong && !transcriptOpen ? 'line-clamp-4 md:line-clamp-none' : ''"
          >
            “{{ transcript }}”
          </blockquote>
          <button
            v-if="transcriptLong"
            type="button"
            class="md:hidden mt-1 -ml-1 inline-flex items-center gap-1 h-11 px-1 text-sm font-medium text-primary"
            :aria-expanded="transcriptOpen"
            @click="transcriptOpen = !transcriptOpen"
          >
            {{ transcriptOpen ? 'Show less' : 'Show full transcript' }}
            <UIcon :name="transcriptOpen ? 'i-ph-caret-up' : 'i-ph-caret-down'" class="w-3.5 h-3.5" />
          </button>
        </div>
        <div v-if="blueprint" class="min-w-0">
          <div class="flex items-center justify-between gap-2 mb-1.5 -mt-2">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-dimmed">Make it yours</p>
            <UButton
              :icon="copied ? 'i-ph-check' : 'i-ph-copy-simple'"
              size="sm"
              variant="ghost"
              :color="copied ? 'success' : 'neutral'"
              class="h-9 -mr-2"
              :aria-label="copied ? 'Copied' : `Copy ${segment.label} script`"
              @click="copyBlueprint"
            >
              {{ copied ? 'Copied' : 'Copy' }}
            </UButton>
          </div>
          <div
            class="font-mono text-[13px] leading-relaxed bg-muted rounded-lg p-3 ring-1 ring-default whitespace-pre-wrap break-words text-toned"
            v-html="highlightPlaceholders(blueprint)"
          />
        </div>
      </div>

      <!-- Visual notes. Silent segment: visuals carry it -->
      <div v-if="visualNotes.length" :class="notesFoldable ? 'pt-1 md:pt-3 border-t border-muted' : ''">
        <button
          v-if="notesFoldable"
          type="button"
          class="md:hidden -ml-1 inline-flex items-center gap-1 h-11 px-1 text-sm font-medium text-muted"
          :aria-expanded="notesOpen"
          @click="notesOpen = !notesOpen"
        >
          <UIcon :name="notesOpen ? 'i-ph-caret-up' : 'i-ph-caret-down'" class="w-3.5 h-3.5" />
          {{ notesOpen ? 'Hide visual notes' : `Show visual notes (${visualNotes.length})` }}
        </button>
        <div class="space-y-1.5" :class="notesFoldable && !notesOpen ? 'hidden md:block' : ''">
          <p v-for="note in visualNotes" :key="note.label" class="text-[13px] md:text-xs text-muted leading-relaxed break-words">
            <span class="font-semibold text-dimmed uppercase tracking-wide text-[11px] md:text-[10px]">{{ note.label }}</span>
            <span class="ml-1.5">{{ note.text }}</span>
          </p>
        </div>
      </div>

      <p v-if="!transcript && !blueprint && !visualNotes.length" class="text-sm md:text-xs text-dimmed italic">
        No script for this segment — it plays visually.
      </p>
    </div>
  </article>
</template>
