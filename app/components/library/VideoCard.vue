<script setup lang="ts">
import type { Video } from '~/types'

interface Props {
  video: Video
  active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  active: false
})

const emit = defineEmits<{
  select: [video: Video]
}>()

const { getVideoUrl, getPosterUrl } = useVideos()

const isEmbed = computed(() =>
  !props.video.video_path && props.video.platform === 'TikTok' && !!props.video.source_url
)

const thumbnailUrl = computed(() => {
  if (isEmbed.value) return getPosterUrl(props.video)
  if (!props.video.video_path) return null
  return getVideoUrl(props.video.video_path)
})

const statusColor = computed(() => {
  return props.video.status === 'complete' ? 'success' : 'neutral'
})

const formattedDate = computed(() => {
  const date = new Date(props.video.updated_at || props.video.created_at)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})
</script>

<template>
  <button
    class="w-full text-left p-2 rounded-md transition-colors hover:bg-[var(--ui-bg-elevated)] group"
    :class="{ 'bg-[var(--ui-bg-elevated)] ring-1 ring-primary-500': active }"
    @click="emit('select', video)"
  >
    <div class="flex gap-3">
      <!-- Thumbnail -->
      <div
        class="w-12 h-16 rounded bg-[var(--ui-bg-muted)] flex-shrink-0 overflow-hidden"
      >
        <img
          v-if="thumbnailUrl && isEmbed"
          :src="thumbnailUrl"
          class="w-full h-full object-cover"
          :alt="video.title || `Recipe by ${video.creator_handle || 'creator'}`"
        />
        <video
          v-else-if="thumbnailUrl"
          :src="thumbnailUrl"
          class="w-full h-full object-cover"
          muted
          preload="metadata"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-[var(--ui-text-muted)]"
        >
          <UIcon name="i-ph-video" class="w-5 h-5" />
        </div>
      </div>

      <!-- Info -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span
            class="text-sm font-medium text-[var(--ui-text)] truncate"
          >
            {{ video.creator_handle || 'Untitled' }}
          </span>
          <UBadge :color="statusColor" size="xs" variant="subtle">
            {{ video.status }}
          </UBadge>
        </div>

        <div v-if="video.platform" class="text-xs text-[var(--ui-text-muted)] truncate">
          {{ video.platform }}
        </div>

        <div class="text-xs text-[var(--ui-text-dimmed)] mt-1">
          {{ formattedDate }}
        </div>
      </div>
    </div>
  </button>
</template>
