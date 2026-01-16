<script setup lang="ts">
import type { Segment } from '~/types'
import { VISUAL_TAGS, PSYCHOLOGICAL_TAGS } from '~/types'

const props = defineProps<{
  segment: Segment
  isActive?: boolean
}>()

const emit = defineEmits<{
  update: [updates: Partial<Segment>]
  seek: []
  generateBlueprint: []
}>()

const expanded = ref(true)
const generatingBlueprint = ref(false)

const allTags = [...VISUAL_TAGS, ...PSYCHOLOGICAL_TAGS]
const tagOptions = allTags.map(t => ({ label: t, value: t }))

const segmentColors: Record<string, { border: string; bg: string; text: string }> = {
  Hook: { border: 'border-l-red-500', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400' },
  Bridge: { border: 'border-l-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/30', text: 'text-yellow-600 dark:text-yellow-400' },
  Value: { border: 'border-l-green-500', bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-600 dark:text-green-400' },
  Proof: { border: 'border-l-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400' },
  CTA: { border: 'border-l-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-600 dark:text-purple-400' }
}

const colors = computed(() => segmentColors[props.segment.label] || {
  border: 'border-l-neutral-500',
  bg: 'bg-neutral-50 dark:bg-neutral-900',
  text: 'text-neutral-600 dark:text-neutral-400'
})

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function handleTagsChange(tags: string[]) {
  emit('update', { tags })
}

async function handleGenerateBlueprint() {
  generatingBlueprint.value = true
  emit('generateBlueprint')
  // Parent will handle the actual generation
  setTimeout(() => generatingBlueprint.value = false, 2000)
}
</script>

<template>
  <div
    class="rounded-lg border-l-4 transition-all"
    :class="[
      colors.border,
      isActive ? `${colors.bg} ring-2 ring-primary-500/50` : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800'
    ]"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between p-4 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-3">
        <UIcon
          :name="expanded ? 'i-ph-caret-down' : 'i-ph-caret-right'"
          class="w-4 h-4 text-neutral-400"
        />
        <span class="font-semibold" :class="colors.text">{{ segment.label }}</span>
        <UBadge size="xs" color="neutral" variant="subtle">
          {{ formatTime(segment.start_time) }} - {{ formatTime(segment.end_time) }}
        </UBadge>
        <!-- Status indicators -->
        <UIcon v-if="segment.transcript_raw" name="i-ph-check-circle" class="w-4 h-4 text-green-500" />
      </div>
      <UButton size="xs" variant="ghost" icon="i-ph-play" @click.stop="emit('seek')" />
    </div>

    <!-- Content -->
    <div v-show="expanded" class="px-4 pb-4 space-y-4 border-t border-neutral-100 dark:border-neutral-800">
      <!-- Transcript -->
      <div class="pt-4">
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-medium text-neutral-700 dark:text-neutral-300">What is said</label>
        </div>
        <UTextarea
          :model-value="segment.transcript_raw || ''"
          placeholder="Transcribed text will appear here..."
          :rows="2"
          autoresize
          class="text-sm"
          @update:model-value="(v) => emit('update', { transcript_raw: v as string })"
        />
      </div>

      <!-- Blueprint -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Blueprint</label>
          <UButton
            v-if="segment.transcript_raw && !segment.script_blueprint"
            size="xs"
            variant="soft"
            icon="i-ph-magic-wand"
            :loading="generatingBlueprint"
            @click.stop="handleGenerateBlueprint"
          >
            Generate
          </UButton>
        </div>
        <UTextarea
          :model-value="segment.script_blueprint || ''"
          placeholder="Template with [variables]..."
          :rows="2"
          autoresize
          class="text-sm font-mono"
          @update:model-value="(v) => emit('update', { script_blueprint: v as string })"
        />
      </div>

      <!-- Visual Notes & Tags in a row -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField label="Visual Notes">
          <UInput
            :model-value="segment.visual_notes || ''"
            placeholder="Camera, cuts, effects..."
            size="sm"
            @update:model-value="(v) => emit('update', { visual_notes: v as string })"
          />
        </UFormField>

        <UFormField label="Tags">
          <USelectMenu
            :model-value="segment.tags || []"
            :items="tagOptions"
            multiple
            placeholder="Select..."
            size="sm"
            @update:model-value="handleTagsChange"
          />
        </UFormField>
      </div>
    </div>
  </div>
</template>
