<script setup lang="ts">
import type { Segment, SkeletalLogicAnalysis, VideoVisualAnalysis } from '~/types'

interface Props {
  // Transcript Skeleton props
  segments: Segment[]

  // In-depth analysis props (videos.skeletal_logic)
  skeletalLogic?: SkeletalLogicAnalysis | null
  skeletalLogicGenerating?: boolean

  // Visual analysis props
  visualAnalysis?: VideoVisualAnalysis | null
  visualAnalysisAnalyzing?: boolean

  // Common props
  saving?: boolean
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error'
}

const props = withDefaults(defineProps<Props>(), {
  skeletalLogic: null,
  skeletalLogicGenerating: false,
  visualAnalysis: null,
  visualAnalysisAnalyzing: false,
  saving: false,
  saveStatus: 'saved'
})

const emit = defineEmits<{
  'update:segments': [segments: Segment[]]
  generateSkeletalLogic: []
  analyzeVisual: []
  save: []
}>()

type PanelTab = 'analysis' | 'transcript' | 'visual'
const activePanel = ref<PanelTab>(props.skeletalLogic ? 'analysis' : 'transcript')

const tabs = [
  {
    id: 'analysis' as const,
    label: 'Skeletal Logic',
    icon: 'i-ph-brain'
  },
  {
    id: 'transcript' as const,
    label: 'Transcript Skeleton',
    icon: 'i-ph-text-aa'
  },
  {
    id: 'visual' as const,
    label: 'Visual Analysis',
    icon: 'i-ph-eye'
  }
]
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Panel Toggle Tabs -->
    <div class="shrink-0 flex border-b border-muted bg-muted/30">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
        :class="[
          activePanel === tab.id
            ? 'text-primary'
            : 'text-muted hover:text-default'
        ]"
        @click="activePanel = tab.id"
      >
        <UIcon :name="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
        <span
          v-if="activePanel === tab.id"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
        />
      </button>
    </div>

    <!-- Panel Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Skeletal Logic (Analysis) Panel -->
      <EditorSkeletalLogic
        v-show="activePanel === 'analysis'"
        :analysis="skeletalLogic"
        :segments="segments"
        :generating="skeletalLogicGenerating"
        @generate="emit('generateSkeletalLogic')"
      />

      <!-- Transcript Skeleton Panel -->
      <EditorTranscriptSkeleton
        v-show="activePanel === 'transcript'"
        :segments="segments"
        :saving="saving"
        :save-status="saveStatus"
        @update:segments="emit('update:segments', $event)"
        @save="emit('save')"
      />

      <!-- Visual Analysis Panel -->
      <EditorVisualAnalysis
        v-show="activePanel === 'visual'"
        :visual-analysis="visualAnalysis"
        :analyzing="visualAnalysisAnalyzing"
        :segments="segments"
        @analyze="emit('analyzeVisual')"
      />
    </div>
  </div>
</template>
