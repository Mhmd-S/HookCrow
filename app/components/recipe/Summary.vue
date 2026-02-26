<script setup lang="ts">
import type { SkeletalLogicAnalysis, VideoVisualAnalysis, VideoAudioAnalysis, LogicFlow } from '~/types'

defineProps<{
  logicFlow: LogicFlow | null
  skeletalLogic: SkeletalLogicAnalysis | null
  visualAnalysis: VideoVisualAnalysis | null
  audioAnalysis: VideoAudioAnalysis | null
}>()
</script>

<template>
  <div class="bg-white rounded-lg border border-neutral-200 p-5">
    <h2 class="text-lg font-semibold text-default mb-3">Quick Summary</h2>

    <!-- Logic Flow -->
    <div v-if="logicFlow" class="mb-4">
      <div class="flex items-center gap-2 mb-1">
        <UIcon name="i-ph-flow-arrow" class="w-4 h-4 text-primary" />
        <span class="font-medium text-sm">Pattern:</span>
        <UBadge color="primary" variant="solid" size="xs">{{ logicFlow.name }}</UBadge>
      </div>
      <p v-if="logicFlow.description" class="text-sm text-muted ml-6">{{ logicFlow.description }}</p>
    </div>

    <!-- Overview -->
    <div v-if="skeletalLogic?.overview" class="mb-4">
      <p class="text-sm text-default leading-relaxed">{{ skeletalLogic.overview }}</p>
    </div>

    <!-- Production Details -->
    <div class="flex flex-wrap gap-2">
      <template v-if="visualAnalysis?.overview">
        <UBadge size="xs" color="neutral" variant="outline">
          <UIcon name="i-ph-star" class="w-3 h-3 mr-1" />
          {{ visualAnalysis.overview.production_quality }}
        </UBadge>
        <UBadge size="xs" color="neutral" variant="outline">
          <UIcon name="i-ph-timer" class="w-3 h-3 mr-1" />
          {{ visualAnalysis.overview.editing_pace }}
        </UBadge>
        <UBadge size="xs" color="neutral" variant="outline">
          <UIcon name="i-ph-frame-corners" class="w-3 h-3 mr-1" />
          {{ visualAnalysis.overview.aspect_ratio }}
        </UBadge>
      </template>
      <UBadge
        v-if="audioAnalysis?.metadata?.overall"
        size="xs"
        color="neutral"
        variant="outline"
      >
        <UIcon name="i-ph-speaker-high" class="w-3 h-3 mr-1" />
        {{ audioAnalysis.metadata.overall.dominant_audio }}
      </UBadge>
    </div>
  </div>
</template>
