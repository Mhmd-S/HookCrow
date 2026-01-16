<script setup lang="ts">
import type { VideoWithSegments, Segment, LogicFlow } from '~/types'

const props = defineProps<{
  video: VideoWithSegments
  currentSegment: Segment | null
  logicFlow: LogicFlow | null
}>()

const copied = ref<string | null>(null)

async function copyToClipboard(text: string, id: string) {
  await navigator.clipboard.writeText(text)
  copied.value = id
  setTimeout(() => {
    copied.value = null
  }, 2000)
}

function getSegmentColor(label: string): string {
  const colors: Record<string, string> = {
    Hook: 'border-red-500 bg-red-50 dark:bg-red-950',
    Bridge: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950',
    Value: 'border-green-500 bg-green-50 dark:bg-green-950',
    Proof: 'border-blue-500 bg-blue-50 dark:bg-blue-950',
    CTA: 'border-purple-500 bg-purple-50 dark:bg-purple-950'
  }
  return colors[label] || 'border-neutral-500 bg-neutral-50 dark:bg-neutral-950'
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="h-full overflow-auto p-6 space-y-6">
    <!-- Creator & Meta -->
    <div>
      <h1 class="text-xl font-bold">{{ video.creator_handle || 'Video Blueprint' }}</h1>
      <div class="flex items-center gap-2 mt-2 text-sm text-neutral-500">
        <UBadge v-if="video.platform" size="sm" color="neutral" variant="subtle">
          {{ video.platform }}
        </UBadge>
      </div>
    </div>

    <!-- Logic Flow -->
    <div v-if="logicFlow" class="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
      <div class="text-sm font-medium text-neutral-500 mb-1">Logic Flow</div>
      <div class="font-semibold">{{ logicFlow.name }}</div>
      <p v-if="logicFlow.description" class="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
        {{ logicFlow.description }}
      </p>
    </div>

    <!-- Current Segment Highlight -->
    <div
      v-if="currentSegment"
      class="p-4 rounded-lg border-l-4 transition-colors"
      :class="getSegmentColor(currentSegment.label)"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="font-semibold">{{ currentSegment.label }}</span>
        <span class="text-xs text-neutral-500">
          {{ formatTime(currentSegment.start_time) }} - {{ formatTime(currentSegment.end_time) }}
        </span>
      </div>
      <p v-if="currentSegment.transcript_raw" class="text-sm mb-2">
        "{{ currentSegment.transcript_raw }}"
      </p>
      <div v-if="currentSegment.script_blueprint" class="mt-3">
        <div class="text-xs text-neutral-500 mb-1">Blueprint:</div>
        <div class="flex items-start gap-2">
          <code class="flex-1 text-sm bg-white dark:bg-neutral-900 p-2 rounded font-mono">
            {{ currentSegment.script_blueprint }}
          </code>
          <UButton
            :icon="copied === `segment-${currentSegment.id}` ? 'i-ph-check' : 'i-ph-copy'"
            variant="ghost"
            size="xs"
            @click="copyToClipboard(currentSegment.script_blueprint!, `segment-${currentSegment.id}`)"
          />
        </div>
      </div>
    </div>

    <!-- Full Script Blueprint -->
    <div v-if="video.script_blueprint" class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Full Script Template</h3>
        <UButton
          :icon="copied === 'full-script' ? 'i-ph-check' : 'i-ph-copy'"
          variant="soft"
          size="xs"
          @click="copyToClipboard(video.script_blueprint!, 'full-script')"
        >
          {{ copied === 'full-script' ? 'Copied!' : 'Copy' }}
        </UButton>
      </div>
      <div class="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-lg">
        <pre class="text-sm whitespace-pre-wrap font-mono">{{ video.script_blueprint }}</pre>
      </div>
    </div>

    <!-- All Segments -->
    <div class="space-y-3">
      <h3 class="font-semibold">All Segments</h3>

      <div
        v-for="segment in video.segments"
        :key="segment.id"
        class="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 transition-colors"
        :class="{ 'ring-2 ring-primary-500': currentSegment?.id === segment.id }"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <UBadge :color="segment.label === 'Hook' ? 'error' : segment.label === 'CTA' ? 'secondary' : 'primary'" size="sm">
              {{ segment.label }}
            </UBadge>
            <span class="text-xs text-neutral-500">
              {{ formatTime(segment.start_time) }}
            </span>
          </div>
          <UButton
            v-if="segment.script_blueprint"
            :icon="copied === segment.id ? 'i-ph-check' : 'i-ph-copy'"
            variant="ghost"
            size="xs"
            @click="copyToClipboard(segment.script_blueprint!, segment.id)"
          />
        </div>

        <p v-if="segment.script_blueprint" class="text-sm font-mono text-neutral-600 dark:text-neutral-400">
          {{ segment.script_blueprint }}
        </p>

        <!-- Tags -->
        <div v-if="segment.tags?.length" class="flex flex-wrap gap-1 mt-2">
          <UBadge
            v-for="tag in segment.tags"
            :key="tag"
            size="xs"
            color="neutral"
            variant="subtle"
          >
            {{ tag }}
          </UBadge>
        </div>
      </div>
    </div>

  </div>
</template>
