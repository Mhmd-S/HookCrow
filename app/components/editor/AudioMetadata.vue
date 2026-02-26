<script setup lang="ts">
import type { VideoAudioAnalysis, AudioMetadata, MusicTrack, SoundEffect } from '~/types'

interface Props {
  audioAnalysis: VideoAudioAnalysis | null
  analyzing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  analyzing: false
})

const emit = defineEmits<{
  'analyze': []
}>()

// Computed helpers
const hasAnalysis = computed(() =>
  props.audioAnalysis?.status === 'completed' && props.audioAnalysis?.metadata
)

const metadata = computed(() => props.audioAnalysis?.metadata)

const statusColor = computed(() => {
  switch (props.audioAnalysis?.status) {
    case 'completed':
      return 'success'
    case 'processing':
      return 'warning'
    case 'failed':
      return 'error'
    default:
      return 'neutral'
  }
})

const statusText = computed(() => {
  switch (props.audioAnalysis?.status) {
    case 'completed':
      return 'Analyzed'
    case 'processing':
      return 'Processing...'
    case 'failed':
      return 'Failed'
    default:
      return 'Not analyzed'
  }
})

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getSfxIcon(type: string): string {
  const icons: Record<string, string> = {
    whoosh: 'i-ph-wind',
    ding: 'i-ph-bell',
    bass_drop: 'i-ph-speaker-high',
    notification: 'i-ph-bell-ringing',
    pop: 'i-ph-dot-outline',
    click: 'i-ph-cursor-click',
    swoosh: 'i-ph-arrow-right',
    impact: 'i-ph-lightning',
    transition: 'i-ph-arrow-right-left',
    riser: 'i-ph-trend-up',
    ambient: 'i-ph-waves',
    other: 'i-ph-waveform'
  }
  return icons[type] || 'i-ph-waveform'
}

function getSfxColor(type: string): 'primary' | 'success' | 'warning' | 'error' | 'info' {
  const colors: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'info'> = {
    whoosh: 'info',
    ding: 'success',
    bass_drop: 'primary',
    notification: 'warning',
    pop: 'success',
    click: 'info',
    swoosh: 'info',
    impact: 'error',
    transition: 'primary',
    riser: 'warning',
    ambient: 'info',
    other: 'primary'
  }
  return colors[type] || 'primary'
}
</script>

<template>
  <div class="space-y-3">
    <!-- Header with status and action -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-muted">Audio Analysis</label>
        <UBadge
          :color="statusColor"
          variant="subtle"
          size="xs"
        >
          {{ statusText }}
        </UBadge>
      </div>
      <UButton
        v-if="!hasAnalysis"
        :loading="analyzing"
        variant="soft"
        size="xs"
        icon="i-ph-waveform"
        @click="emit('analyze')"
      >
        {{ analyzing ? 'Analyzing...' : 'Analyze Audio' }}
      </UButton>
      <UButton
        v-else
        variant="ghost"
        size="xs"
        icon="i-ph-arrows-clockwise"
        @click="emit('analyze')"
      >
        Re-analyze
      </UButton>
    </div>

    <!-- Error state -->
    <UAlert
      v-if="audioAnalysis?.status === 'failed' && audioAnalysis?.error"
      color="error"
      variant="soft"
      :title="audioAnalysis.error"
      icon="i-ph-warning-circle"
    />

    <!-- Analysis results -->
    <div v-if="hasAnalysis && metadata" class="space-y-3">
      <!-- Overall audio characteristics -->
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-if="metadata.overall.has_speech"
          color="primary"
          variant="outline"
          size="xs"
        >
          <UIcon name="i-ph-microphone" class="w-3 h-3 mr-1" />
          Speech
        </UBadge>
        <UBadge
          v-if="metadata.overall.has_music"
          color="success"
          variant="outline"
          size="xs"
        >
          <UIcon name="i-ph-music-notes" class="w-3 h-3 mr-1" />
          Music
        </UBadge>
        <UBadge
          v-if="metadata.overall.has_sfx"
          color="warning"
          variant="outline"
          size="xs"
        >
          <UIcon name="i-ph-waveform" class="w-3 h-3 mr-1" />
          SFX
        </UBadge>
      </div>

      <!-- Music tracks -->
      <div v-if="metadata.music.detected && metadata.music.tracks.length > 0" class="space-y-2">
        <div class="text-xs font-medium text-muted">Music Tracks</div>
        <div class="space-y-1">
          <div
            v-for="(track, index) in metadata.music.tracks"
            :key="index"
            class="flex items-start gap-2 p-2 bg-muted rounded text-xs"
          >
            <UIcon name="i-ph-music-notes-simple" class="w-4 h-4 text-success shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <div class="font-medium text-default truncate">
                {{ track.title || 'Unknown Track' }}
              </div>
              <div class="text-muted truncate">
                {{ track.artist || 'Unknown Artist' }}
              </div>
              <div v-if="track.description" class="text-dimmed text-xs mt-0.5 truncate">
                {{ track.description }}
              </div>
              <div class="flex items-center gap-2 mt-1 text-dimmed">
                <span>{{ formatTime(track.start_time) }} - {{ formatTime(track.end_time) }}</span>
                <span v-if="track.bpm">{{ track.bpm }} BPM</span>
                <span v-if="track.genre">{{ track.genre }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sound effects -->
      <div v-if="metadata.sound_effects.length > 0" class="space-y-2">
        <div class="text-xs font-medium text-muted">Sound Effects</div>
        <div class="flex flex-wrap gap-1">
          <UTooltip
            v-for="(sfx, index) in metadata.sound_effects"
            :key="index"
            :text="`${sfx.label} @ ${formatTime(sfx.start_time)}`"
          >
            <UBadge
              :color="getSfxColor(sfx.type)"
              variant="subtle"
              size="xs"
              class="cursor-help"
            >
              <UIcon :name="getSfxIcon(sfx.type)" class="w-3 h-3 mr-1" />
              {{ sfx.type }}
            </UBadge>
          </UTooltip>
        </div>
      </div>

      <!-- Empty state for no audio detected -->
      <div
        v-if="!metadata.overall.has_music && !metadata.overall.has_sfx"
        class="text-xs text-dimmed italic"
      >
        No music or sound effects detected in this video.
      </div>

      <!-- Analysis timestamp -->
      <div v-if="audioAnalysis?.analyzed_at" class="text-xs text-dimmed">
        Analyzed {{ new Date(audioAnalysis.analyzed_at).toLocaleString() }}
      </div>
    </div>

    <!-- Not analyzed state -->
    <div
      v-else-if="!analyzing && audioAnalysis?.status !== 'processing'"
      class="text-xs text-dimmed italic"
    >
      Click "Analyze Audio" to detect music tracks and sound effects.
    </div>

    <!-- Processing state -->
    <div
      v-else-if="analyzing || audioAnalysis?.status === 'processing'"
      class="flex items-center gap-2 text-xs text-muted"
    >
      <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin" />
      Analyzing audio... This may take a moment.
    </div>
  </div>
</template>
