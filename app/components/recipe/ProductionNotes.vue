<script setup lang="ts">
import type { VideoVisualAnalysis, SkeletalLogicAnalysis } from '~/types'

defineProps<{
  visualAnalysis: VideoVisualAnalysis | null
  skeletalLogic: SkeletalLogicAnalysis | null
}>()
</script>

<template>
  <div class="bg-white rounded-lg border border-neutral-200 p-5">
    <h2 class="text-lg font-semibold text-default mb-3">Production Notes</h2>

    <div class="space-y-3 text-sm">
      <!-- Visual Overview -->
      <template v-if="visualAnalysis?.overview">
        <div class="flex items-start gap-2">
          <span class="text-muted shrink-0 w-32">Overall style:</span>
          <span class="text-default">{{ visualAnalysis.overview.overall_style }}</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="text-muted shrink-0 w-32">Editing pace:</span>
          <span class="text-default">{{ visualAnalysis.overview.editing_pace }}</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="text-muted shrink-0 w-32">Quality level:</span>
          <UBadge size="xs" color="neutral" variant="subtle">{{ visualAnalysis.overview.production_quality }}</UBadge>
        </div>
        <div class="flex items-start gap-2">
          <span class="text-muted shrink-0 w-32">Aspect ratio:</span>
          <span class="text-default">{{ visualAnalysis.overview.aspect_ratio }}</span>
        </div>
        <div v-if="visualAnalysis.overview.notable_techniques.length > 0" class="flex items-start gap-2">
          <span class="text-muted shrink-0 w-32">Techniques:</span>
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="t in visualAnalysis.overview.notable_techniques" :key="t" size="xs" color="primary" variant="subtle">{{ t }}</UBadge>
          </div>
        </div>
      </template>

      <!-- Key Takeaways -->
      <div v-if="skeletalLogic?.keyTakeaways && skeletalLogic.keyTakeaways.length > 0">
        <h3 class="font-semibold text-default mt-4 mb-2">Key Takeaways</h3>
        <ul class="list-disc list-inside space-y-1 text-default">
          <li v-for="(takeaway, i) in skeletalLogic.keyTakeaways" :key="i">{{ takeaway }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>
