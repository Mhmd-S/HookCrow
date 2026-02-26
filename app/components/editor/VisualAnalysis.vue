<script setup lang="ts">
import type { VideoVisualAnalysis, SegmentVisualAnalysis, Segment } from '~/types'

interface Props {
  visualAnalysis: VideoVisualAnalysis | null
  analyzing?: boolean
  segments?: Segment[]
}

const props = withDefaults(defineProps<Props>(), {
  analyzing: false,
  segments: () => []
})

const emit = defineEmits<{
  'analyze': []
}>()

const hasAnalysis = computed(() =>
  props.visualAnalysis?.status === 'completed' && props.visualAnalysis?.overview
)

const overview = computed(() => props.visualAnalysis?.overview)
const segmentVisuals = computed(() => props.visualAnalysis?.segments || [])

const statusColor = computed(() => {
  switch (props.visualAnalysis?.status) {
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
  switch (props.visualAnalysis?.status) {
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

const segmentColors: Record<string, string> = {
  Hook: 'text-red-500',
  Bridge: 'text-yellow-500',
  Value: 'text-green-500',
  Proof: 'text-blue-500',
  CTA: 'text-purple-500'
}

const segmentBgColors: Record<string, string> = {
  Hook: 'border-red-500/30',
  Bridge: 'border-yellow-500/30',
  Value: 'border-green-500/30',
  Proof: 'border-blue-500/30',
  CTA: 'border-purple-500/30'
}

function getSegmentLabel(index: number): string {
  return props.segments?.[index]?.label || `Segment ${index + 1}`
}

function getSegmentTime(index: number): string {
  const seg = props.segments?.[index]
  if (!seg) return ''
  const start = Math.floor(seg.start_time)
  const end = Math.floor(seg.end_time)
  return `${start}s - ${end}s`
}

function getQualityColor(quality: string): 'error' | 'warning' | 'success' | 'primary' {
  switch (quality) {
    case 'low': return 'error'
    case 'medium': return 'warning'
    case 'high': return 'success'
    case 'professional': return 'primary'
    default: return 'warning'
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4">
    <!-- Header with status and action -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-muted">Visual Analysis</label>
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
        icon="i-ph-eye"
        @click="emit('analyze')"
      >
        {{ analyzing ? 'Analyzing...' : 'Analyze Visual' }}
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
      v-if="visualAnalysis?.status === 'failed' && visualAnalysis?.error"
      color="error"
      variant="soft"
      :title="visualAnalysis.error"
      icon="i-ph-warning-circle"
    />

    <!-- Analysis results -->
    <template v-if="hasAnalysis && overview">
      <!-- Overview Section -->
      <div class="space-y-2">
        <div class="text-xs font-medium text-muted">Overview</div>
        <div class="p-3 bg-muted rounded space-y-2">
          <div class="text-xs text-default">{{ overview.overall_style }}</div>
          <div class="flex flex-wrap gap-1">
            <UBadge
              :color="getQualityColor(overview.production_quality)"
              variant="subtle"
              size="xs"
            >
              <UIcon name="i-ph-star" class="w-3 h-3 mr-1" />
              {{ overview.production_quality }}
            </UBadge>
            <UBadge color="info" variant="outline" size="xs">
              <UIcon name="i-ph-timer" class="w-3 h-3 mr-1" />
              {{ overview.editing_pace }}
            </UBadge>
            <UBadge color="neutral" variant="outline" size="xs">
              <UIcon name="i-ph-frame-corners" class="w-3 h-3 mr-1" />
              {{ overview.aspect_ratio }}
            </UBadge>
          </div>
          <div v-if="overview.notable_techniques.length > 0" class="flex flex-wrap gap-1 mt-1">
            <UBadge
              v-for="(tech, i) in overview.notable_techniques"
              :key="i"
              color="primary"
              variant="outline"
              size="xs"
            >
              {{ tech }}
            </UBadge>
          </div>
        </div>
      </div>

      <!-- Per-Segment Visual Analysis -->
      <div class="space-y-3">
        <div class="text-xs font-medium text-muted">Per-Segment Breakdown</div>

        <div
          v-for="(visual, index) in segmentVisuals"
          :key="index"
          class="border rounded p-3 space-y-2"
          :class="segmentBgColors[getSegmentLabel(index)] || 'border-muted'"
        >
          <!-- Segment header -->
          <div class="flex items-center justify-between">
            <span
              class="text-xs font-semibold"
              :class="segmentColors[getSegmentLabel(index)] || 'text-default'"
            >
              {{ getSegmentLabel(index) }}
            </span>
            <span class="text-xs text-dimmed">{{ getSegmentTime(index) }}</span>
          </div>

          <!-- Camera & Shot -->
          <div v-if="visual.camera_movements?.length || visual.shot_types?.length" class="flex flex-wrap gap-1">
            <UBadge
              v-for="(move, i) in visual.camera_movements"
              :key="`cam-${i}`"
              color="info"
              variant="subtle"
              size="xs"
            >
              <UIcon name="i-ph-video-camera" class="w-3 h-3 mr-1" />
              {{ move }}
            </UBadge>
            <UBadge
              v-for="(shot, i) in visual.shot_types"
              :key="`shot-${i}`"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              {{ shot }}
            </UBadge>
          </div>

          <!-- Color Grading -->
          <div v-if="visual.color_grading" class="text-xs">
            <div class="flex items-center gap-2">
              <span class="text-dimmed">Color:</span>
              <span class="text-muted">{{ visual.color_grading.mood }} · {{ visual.color_grading.style }}</span>
            </div>
            <div v-if="visual.color_grading.dominant_colors?.length" class="flex flex-wrap gap-1 mt-1">
              <UBadge
                v-for="(color, i) in visual.color_grading.dominant_colors"
                :key="i"
                color="neutral"
                variant="outline"
                size="xs"
              >
                {{ color }}
              </UBadge>
            </div>
          </div>

          <!-- Scene Composition -->
          <div v-if="visual.scene_composition" class="text-xs">
            <span class="text-dimmed">Composition: </span>
            <span class="text-muted">{{ visual.scene_composition }}</span>
          </div>

          <!-- Text Overlays -->
          <div v-if="visual.text_overlays?.detected" class="space-y-1">
            <div
              v-for="(overlay, i) in visual.text_overlays.items"
              :key="i"
              class="flex items-start gap-2 text-xs"
            >
              <UIcon name="i-ph-text-t" class="w-3 h-3 text-warning shrink-0 mt-0.5" />
              <div>
                <span class="text-default font-medium">"{{ overlay.text }}"</span>
                <span class="text-dimmed"> · {{ overlay.style }} · {{ overlay.position }}</span>
              </div>
            </div>
          </div>

          <!-- Transition -->
          <div v-if="visual.transitions" class="text-xs">
            <span class="text-dimmed">Transition: </span>
            <UBadge color="primary" variant="subtle" size="xs">
              {{ visual.transitions.type }}
            </UBadge>
            <span class="text-muted ml-1">{{ visual.transitions.description }}</span>
          </div>

          <!-- Visual Pacing -->
          <div v-if="visual.visual_pacing" class="text-xs">
            <span class="text-dimmed">Pacing: </span>
            <span class="text-muted">{{ visual.visual_pacing }}</span>
          </div>

          <!-- Visual Tags -->
          <div v-if="visual.detected_visual_tags?.length" class="flex flex-wrap gap-1">
            <UBadge
              v-for="(tag, i) in visual.detected_visual_tags"
              :key="i"
              color="success"
              variant="subtle"
              size="xs"
            >
              <UIcon name="i-ph-tag" class="w-3 h-3 mr-1" />
              {{ tag }}
            </UBadge>
          </div>

          <!-- Branding -->
          <div v-if="visual.branding_elements?.length" class="flex flex-wrap gap-1">
            <UBadge
              v-for="(brand, i) in visual.branding_elements"
              :key="i"
              color="warning"
              variant="outline"
              size="xs"
            >
              {{ brand }}
            </UBadge>
          </div>

          <!-- Thumbnail Frames -->
          <div v-if="visual.thumbnail_worthy_frames?.length" class="text-xs space-y-1">
            <div class="text-dimmed flex items-center gap-1">
              <UIcon name="i-ph-image" class="w-3 h-3" />
              Thumbnail moments:
            </div>
            <div
              v-for="(frame, i) in visual.thumbnail_worthy_frames"
              :key="i"
              class="text-muted pl-4"
            >
              · {{ frame }}
            </div>
          </div>
        </div>
      </div>

      <!-- Analysis timestamp -->
      <div v-if="visualAnalysis?.analyzed_at" class="text-xs text-dimmed">
        Analyzed {{ new Date(visualAnalysis.analyzed_at).toLocaleString() }}
      </div>
    </template>

    <!-- Not analyzed state -->
    <div
      v-else-if="!analyzing && visualAnalysis?.status !== 'processing'"
      class="text-xs text-dimmed italic"
    >
      Click "Analyze Visual" to detect camera movements, color grading, text overlays, transitions, and more.
    </div>

    <!-- Processing state -->
    <div
      v-else-if="analyzing || visualAnalysis?.status === 'processing'"
      class="flex items-center gap-2 text-xs text-muted"
    >
      <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin" />
      Analyzing visual elements... This may take a moment.
    </div>
  </div>
</template>
