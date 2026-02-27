<script setup lang="ts">
import type { Segment, SkeletalLogicSegmentAnalysis, SegmentVisualAnalysis, MusicTrack, SoundEffect } from '~/types'
import { highlightPlaceholders } from '~/utils/highlightPlaceholders'

const props = defineProps<{
  segment: Segment
  segmentIndex: number
  skeletalLogicSegment: SkeletalLogicSegmentAnalysis | null
  visualSegment: SegmentVisualAnalysis | null
  musicTracks: MusicTrack[]
  soundEffects: SoundEffect[]
}>()

const segmentColors: Record<string, string> = {
  Hook: 'border-red-500',
  Bridge: 'border-yellow-500',
  Value: 'border-green-500',
  Proof: 'border-blue-500',
  CTA: 'border-purple-500'
}

const segmentBadgeColors: Record<string, string> = {
  Hook: 'error',
  Bridge: 'warning',
  Value: 'success',
  Proof: 'info',
  CTA: 'secondary'
}

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

const editing = computed(() => props.visualSegment?.editing_instructions ?? null)

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
    class="bg-white rounded-lg border border-neutral-200 overflow-hidden"
    :class="`border-l-4 ${segmentColors[segment.label] || 'border-neutral-400'}`"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-neutral-100">
      <div class="flex items-center gap-2">
        <UBadge :color="(segmentBadgeColors[segment.label] || 'neutral') as any" variant="solid" size="sm">
          {{ segment.label }}
        </UBadge>
        <span class="text-sm text-muted">{{ timeRange }}</span>
      </div>
      <span class="text-xs text-muted">Step {{ segmentIndex + 1 }}</span>
    </div>

    <div class="p-4 space-y-4">
      <!-- Goal -->
      <div v-if="skeletalLogicSegment?.goal" class="flex items-start gap-2">
        <UIcon name="i-ph-target" class="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p class="text-sm text-default">{{ skeletalLogicSegment.goal }}</p>
      </div>

      <!-- Script -->
      <div v-if="segment.script_blueprint || segment.transcript_raw">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-semibold text-default flex items-center gap-1.5">
            <UIcon name="i-ph-scroll" class="w-4 h-4" />
            Script
          </h4>
          <UButton
            v-if="segment.script_blueprint"
            :icon="copied ? 'i-ph-check' : 'i-ph-copy'"
            size="xs"
            variant="ghost"
            @click="copyBlueprint"
          />
        </div>
        <div
          v-if="segment.script_blueprint"
          class="font-mono text-sm bg-neutral-50 rounded p-3 border border-neutral-100 whitespace-pre-wrap"
          v-html="highlightPlaceholders(segment.script_blueprint)"
        />
        <p v-if="segment.transcript_raw" class="text-xs text-muted mt-2 italic">
          "{{ segment.transcript_raw }}"
        </p>
      </div>

      <!-- How to Film It -->
      <div v-if="visualSegment">
        <h4 class="text-sm font-semibold text-default flex items-center gap-1.5 mb-2">
          <UIcon name="i-ph-camera" class="w-4 h-4" />
          How to Film It
        </h4>
        <div class="space-y-2 text-sm">
          <div v-if="visualSegment.shot_types?.length > 0" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Shot:</span>
            <div class="flex flex-wrap gap-1">
              <UBadge v-for="s in visualSegment.shot_types" :key="s" size="xs" color="neutral" variant="subtle">{{ s }}</UBadge>
            </div>
          </div>
          <div v-if="visualSegment.camera_movements?.length > 0" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Camera:</span>
            <div class="flex flex-wrap gap-1">
              <UBadge v-for="c in visualSegment.camera_movements" :key="c" size="xs" color="info" variant="subtle">{{ c }}</UBadge>
            </div>
          </div>
          <div v-if="visualSegment.scene_composition" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Framing:</span>
            <span class="text-default">{{ visualSegment.scene_composition }}</span>
          </div>
          <div v-if="visualSegment.transitions" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Transition:</span>
            <span class="text-default">{{ visualSegment.transitions.type }} — {{ visualSegment.transitions.description }}</span>
          </div>
        </div>
      </div>

      <!-- How to Edit It -->
      <div v-if="editing">
        <h4 class="text-sm font-semibold text-default flex items-center gap-1.5 mb-2">
          <UIcon name="i-ph-scissors" class="w-4 h-4" />
          How to Edit It
        </h4>
        <div class="space-y-3 text-sm">
          <!-- Cuts -->
          <div v-if="editing.cuts?.length > 0">
            <span class="text-muted text-xs font-medium uppercase tracking-wide">Cuts</span>
            <div class="mt-1 space-y-1">
              <div v-for="(cut, i) in editing.cuts" :key="'cut-' + i" class="flex items-start gap-2">
                <span class="text-muted shrink-0 font-mono text-xs mt-0.5">{{ cut.timestamp }}</span>
                <span class="text-default">
                  <UBadge size="xs" color="neutral" variant="subtle" class="mr-1">{{ cut.type }}</UBadge>
                  {{ cut.description }}
                </span>
              </div>
            </div>
          </div>

          <!-- Speed Changes -->
          <div v-if="editing.speed_changes?.length > 0">
            <span class="text-muted text-xs font-medium uppercase tracking-wide">Speed</span>
            <div class="mt-1 space-y-1">
              <div v-for="(sp, i) in editing.speed_changes" :key="'speed-' + i" class="flex items-start gap-2">
                <span class="text-muted shrink-0 font-mono text-xs mt-0.5">{{ sp.range }}</span>
                <span class="text-default">
                  <UBadge size="xs" color="info" variant="subtle" class="mr-1">{{ sp.speed }}</UBadge>
                  {{ sp.reason }}
                </span>
              </div>
            </div>
          </div>

          <!-- Zoom Keyframes -->
          <div v-if="editing.zoom_keyframes?.length > 0">
            <span class="text-muted text-xs font-medium uppercase tracking-wide">Zoom</span>
            <div class="mt-1 space-y-1">
              <div v-for="(z, i) in editing.zoom_keyframes" :key="'zoom-' + i" class="flex items-start gap-2">
                <span class="text-muted shrink-0 font-mono text-xs mt-0.5">{{ z.timestamp }}</span>
                <span class="text-default">{{ z.zoom_level }} — {{ z.direction }}</span>
              </div>
            </div>
          </div>

          <!-- Effects -->
          <div v-if="editing.effects?.length > 0">
            <span class="text-muted text-xs font-medium uppercase tracking-wide">Effects</span>
            <div class="mt-1 space-y-1">
              <div v-for="(fx, i) in editing.effects" :key="'fx-' + i" class="flex items-start gap-2">
                <UBadge size="xs" color="warning" variant="subtle">{{ fx.type }}</UBadge>
                <span class="text-default">{{ fx.parameters }} <span class="text-muted">({{ fx.timing }})</span></span>
              </div>
            </div>
          </div>

          <!-- Text to Add -->
          <div v-if="editing.text_to_add?.length > 0">
            <span class="text-muted text-xs font-medium uppercase tracking-wide">Text Overlays</span>
            <div class="mt-1 space-y-1">
              <div v-for="(txt, i) in editing.text_to_add" :key="'txt-' + i" class="flex items-start gap-2">
                <span class="text-muted shrink-0 font-mono text-xs mt-0.5">{{ txt.appear_at }}</span>
                <span class="text-default">
                  "{{ txt.text }}" <span class="text-muted">· {{ txt.position }} · {{ txt.animation }} · {{ txt.duration }}</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Color Grade -->
          <div v-if="editing.color_grade_preset" class="flex items-start gap-2">
            <span class="text-muted text-xs font-medium uppercase tracking-wide shrink-0">Color</span>
            <span class="text-default text-xs">{{ editing.color_grade_preset }}</span>
          </div>

          <!-- Audio Sync -->
          <div v-if="editing.audio_sync_notes" class="flex items-start gap-2">
            <span class="text-muted text-xs font-medium uppercase tracking-wide shrink-0">Sync</span>
            <span class="text-default text-xs">{{ editing.audio_sync_notes }}</span>
          </div>
        </div>
      </div>

      <!-- Audio Cues -->
      <div v-if="musicTracks.length > 0 || soundEffects.length > 0">
        <h4 class="text-sm font-semibold text-default flex items-center gap-1.5 mb-2">
          <UIcon name="i-ph-music-notes" class="w-4 h-4" />
          Audio Cues
        </h4>
        <div class="space-y-2 text-sm">
          <div v-for="(track, i) in musicTracks" :key="'music-' + i" class="flex items-start gap-2">
            <UBadge size="xs" color="primary" variant="subtle">Music</UBadge>
            <span class="text-default">
              {{ track.title || track.genre || 'Background music' }}
              <span v-if="track.bpm" class="text-muted"> ({{ track.bpm }} BPM)</span>
            </span>
          </div>
          <div v-for="(sfx, i) in soundEffects" :key="'sfx-' + i" class="flex items-start gap-2">
            <UBadge size="xs" color="warning" variant="subtle">SFX</UBadge>
            <span class="text-default">{{ sfx.label }} ({{ sfx.type }})</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
