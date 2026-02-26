<script setup lang="ts">
import type { VideoWithSegments, Segment } from '~/types'

const props = defineProps<{
  video: VideoWithSegments
  videoUrl: string
}>()

const emit = defineEmits<{
  segmentChange: [segment: Segment | null]
}>()

const { SEMANTIC_TAG_CATEGORIES } = await import('~/types')

function getTagCategory(tag: string): string {
  if (SEMANTIC_TAG_CATEGORIES.domain.includes(tag as any)) return 'domain'
  if (SEMANTIC_TAG_CATEGORIES.format.includes(tag as any)) return 'format'
  if (SEMANTIC_TAG_CATEGORIES.audience.includes(tag as any)) return 'audience'
  return 'domain'
}

function getTagColor(category: string): string {
  switch (category) {
    case 'domain': return 'primary'
    case 'format': return 'success'
    case 'audience': return 'warning'
    default: return 'neutral'
  }
}
</script>

<template>
  <div>
    <!-- Video Player -->
    <div class="bg-black rounded-lg overflow-hidden">
      <VideoPlayer
        :src="videoUrl"
        :segments="video.segments"
        @segment-change="(s) => emit('segmentChange', s)"
      />
    </div>

    <!-- Meta -->
    <div class="mt-4">
      <h1 class="text-2xl font-bold text-default">
        {{ video.title || video.creator_handle || 'Video Recipe' }}
      </h1>
      <div class="flex flex-wrap items-center gap-2 mt-2">
        <UBadge v-if="video.creator_handle" size="sm" color="neutral" variant="subtle">
          {{ video.creator_handle }}
        </UBadge>
        <UBadge v-if="video.platform" size="sm" color="neutral" variant="subtle">
          {{ video.platform }}
        </UBadge>
        <template v-if="video.semantic_tags && video.semantic_tags.length > 0">
          <UBadge
            v-for="tag in video.semantic_tags"
            :key="tag"
            size="sm"
            :color="getTagColor(getTagCategory(tag)) as any"
            variant="subtle"
          >
            {{ tag }}
          </UBadge>
        </template>
      </div>
    </div>
  </div>
</template>
