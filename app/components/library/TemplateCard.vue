<script setup lang="ts">
import type { LogicFlow } from '~/types'

interface Props {
  template: LogicFlow
  active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  active: false
})

const emit = defineEmits<{
  select: [template: LogicFlow]
  apply: [template: LogicFlow]
}>()

// Extract short name from full name (e.g., "PAS (Problem-Agitation-Solution)" -> "PAS")
const shortName = computed(() => {
  const match = props.template.name.match(/^([^(]+)/)
  return match ? match[1].trim() : props.template.name
})

// Get template segment count from markdown
const segmentCount = computed(() => {
  if (!props.template.template_markdown) return 0
  const lines = props.template.template_markdown.split('\n')
  return lines.filter((line) => line.match(/^\d+.*\[.+\]:/)).length
})
</script>

<template>
  <div
    class="p-2 rounded-md transition-colors hover:bg-[var(--ui-bg-elevated)] group cursor-pointer"
    :class="{ 'bg-[var(--ui-bg-elevated)] ring-1 ring-primary-500': active }"
    @click="emit('select', template)"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <UIcon
            name="i-ph-file-text"
            class="w-4 h-4 text-[var(--ui-text-muted)] flex-shrink-0"
          />
          <span class="text-sm font-medium text-[var(--ui-text)] truncate">
            {{ shortName }}
          </span>
        </div>

        <p class="text-xs text-[var(--ui-text-muted)] line-clamp-2">
          {{ template.description }}
        </p>

        <div
          v-if="segmentCount > 0"
          class="text-xs text-[var(--ui-text-dimmed)] mt-1"
        >
          {{ segmentCount }} segments
        </div>
      </div>

      <UButton
        size="xs"
        variant="ghost"
        icon="i-ph-arrow-right"
        class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        @click.stop="emit('apply', template)"
      />
    </div>
  </div>
</template>
