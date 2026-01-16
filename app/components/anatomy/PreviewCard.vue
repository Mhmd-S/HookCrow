<script setup lang="ts">
import type { Segment } from '~/types'

const props = defineProps<{
  segment: Segment
  isActive?: boolean
}>()

const emit = defineEmits<{
  seek: []
}>()

const segmentColors: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  Hook: {
    border: 'border-l-red-500',
    bg: 'bg-red-50 dark:bg-red-950/30',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500'
  },
  Bridge: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    text: 'text-yellow-600 dark:text-yellow-400',
    dot: 'bg-yellow-500'
  },
  Value: {
    border: 'border-l-green-500',
    bg: 'bg-green-50 dark:bg-green-950/30',
    text: 'text-green-600 dark:text-green-400',
    dot: 'bg-green-500'
  },
  Proof: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  CTA: {
    border: 'border-l-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    text: 'text-purple-600 dark:text-purple-400',
    dot: 'bg-purple-500'
  }
}

const colors = computed(
  () =>
    segmentColors[props.segment.label] || {
      border: 'border-l-neutral-500',
      bg: 'bg-neutral-50 dark:bg-neutral-900',
      text: 'text-neutral-600 dark:text-neutral-400',
      dot: 'bg-neutral-500'
    }
)

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const description = computed(() => {
  return props.segment.script_blueprint || props.segment.transcript_raw || ''
})

const truncatedDescription = computed(() => {
  const text = description.value
  if (text.length <= 80) return text
  return text.slice(0, 80) + '...'
})

const hasContent = computed(() => {
  return !!(props.segment.transcript_raw || props.segment.script_blueprint)
})
</script>

<template>
  <button
    class="w-full text-left p-3 rounded-lg border-l-4 transition-all hover:bg-[var(--ui-bg-elevated)]"
    :class="[
      colors.border,
      isActive
        ? `${colors.bg} ring-2 ring-primary-500/50`
        : 'bg-[var(--ui-bg)] border border-[var(--ui-border)]'
    ]"
    @click="emit('seek')"
  >
    <div class="flex items-start gap-3">
      <!-- Label indicator -->
      <div
        class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
        :class="colors.dot"
      />

      <div class="flex-1 min-w-0">
        <!-- Header -->
        <div class="flex items-center gap-2 mb-1">
          <span class="text-sm font-semibold" :class="colors.text">
            {{ segment.label }}
          </span>
          <span class="text-xs text-[var(--ui-text-muted)]">
            {{ formatTime(segment.start_time) }} -
            {{ formatTime(segment.end_time) }}
          </span>
          <UIcon
            v-if="hasContent"
            name="i-ph-check-circle"
            class="w-3 h-3 text-green-500 ml-auto"
          />
        </div>

        <!-- Description -->
        <p
          v-if="truncatedDescription"
          class="text-xs text-[var(--ui-text-muted)] leading-relaxed"
        >
          {{ truncatedDescription }}
        </p>
        <p
          v-else
          class="text-xs text-[var(--ui-text-dimmed)] italic"
        >
          No content yet
        </p>

        <!-- Tags preview -->
        <div
          v-if="segment.tags && segment.tags.length > 0"
          class="flex flex-wrap gap-1 mt-2"
        >
          <UBadge
            v-for="tag in segment.tags.slice(0, 3)"
            :key="tag"
            size="xs"
            color="neutral"
            variant="subtle"
          >
            {{ tag }}
          </UBadge>
          <UBadge
            v-if="segment.tags.length > 3"
            size="xs"
            color="neutral"
            variant="subtle"
          >
            +{{ segment.tags.length - 3 }}
          </UBadge>
        </div>
      </div>

      <!-- Play button -->
      <UIcon
        name="i-ph-play-circle"
        class="w-5 h-5 text-[var(--ui-text-muted)] flex-shrink-0 hover:text-[var(--ui-text)] transition-colors"
      />
    </div>
  </button>
</template>
