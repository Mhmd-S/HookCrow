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
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

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
        <span class="text-sm text-muted">
          {{ formatTime(segment.start_time) }} - {{ formatTime(segment.end_time) }}
        </span>
      </div>
      <span class="text-xs text-muted">Step {{ segmentIndex + 1 }}</span>
    </div>

    <div class="p-4 space-y-4">
      <!-- What to Say -->
      <div v-if="segment.script_blueprint || segment.transcript_raw">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-semibold text-default flex items-center gap-1.5">
            <UIcon name="i-ph-chat-text" class="w-4 h-4" />
            What to Say
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
          Original: "{{ segment.transcript_raw }}"
        </p>
      </div>

      <!-- How to Film It -->
      <div v-if="visualSegment">
        <h4 class="text-sm font-semibold text-default flex items-center gap-1.5 mb-2">
          <UIcon name="i-ph-camera" class="w-4 h-4" />
          How to Film It
        </h4>
        <div class="space-y-2 text-sm">
          <div v-if="visualSegment.shot_types.length > 0" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Shot:</span>
            <div class="flex flex-wrap gap-1">
              <UBadge v-for="s in visualSegment.shot_types" :key="s" size="xs" color="neutral" variant="subtle">{{ s }}</UBadge>
            </div>
          </div>
          <div v-if="visualSegment.camera_movements.length > 0" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Camera:</span>
            <div class="flex flex-wrap gap-1">
              <UBadge v-for="c in visualSegment.camera_movements" :key="c" size="xs" color="info" variant="subtle">{{ c }}</UBadge>
            </div>
          </div>
          <div v-if="visualSegment.color_grading" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Color mood:</span>
            <span class="text-default">{{ visualSegment.color_grading.mood }} / {{ visualSegment.color_grading.style }}</span>
          </div>
          <div v-if="visualSegment.text_overlays?.detected" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Text overlay:</span>
            <div>
              <div v-for="(item, i) in visualSegment.text_overlays.items" :key="i" class="text-default">
                "{{ item.text }}" <span class="text-muted">({{ item.style }}, {{ item.position }})</span>
              </div>
            </div>
          </div>
          <div v-if="visualSegment.transitions" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Transition:</span>
            <span class="text-default">{{ visualSegment.transitions.type }} — {{ visualSegment.transitions.description }}</span>
          </div>
          <div v-if="visualSegment.scene_composition" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Composition:</span>
            <span class="text-default">{{ visualSegment.scene_composition }}</span>
          </div>
          <div v-if="visualSegment.visual_pacing" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Pacing:</span>
            <span class="text-default">{{ visualSegment.visual_pacing }}</span>
          </div>
          <div v-if="visualSegment.detected_visual_tags.length > 0" class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Style tags:</span>
            <div class="flex flex-wrap gap-1">
              <UBadge v-for="t in visualSegment.detected_visual_tags" :key="t" size="xs" color="success" variant="subtle">{{ t }}</UBadge>
            </div>
          </div>
        </div>
      </div>

      <!-- Why It Works -->
      <div v-if="skeletalLogicSegment">
        <h4 class="text-sm font-semibold text-default flex items-center gap-1.5 mb-2">
          <UIcon name="i-ph-brain" class="w-4 h-4" />
          Why It Works
        </h4>
        <div class="space-y-1.5 text-sm">
          <div class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Goal:</span>
            <span class="text-default">{{ skeletalLogicSegment.goal }}</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Technique:</span>
            <span class="text-default">{{ skeletalLogicSegment.technique }}</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Psychology:</span>
            <span class="text-default">{{ skeletalLogicSegment.psychology }}</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Execution:</span>
            <span class="text-default">{{ skeletalLogicSegment.execution }}</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="text-muted shrink-0 w-24">Outcome:</span>
            <span class="text-default">{{ skeletalLogicSegment.outcome }}</span>
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
