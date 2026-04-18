<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { bookmarks, loading, loaded, fetchBookmarks } = useBookmarks()
const { getVideoUrl } = useVideos()

onMounted(() => {
  if (!loaded.value) fetchBookmarks()
})

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds >= 3600) return null
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight text-default">Bookmarks</h1>
      <p v-if="loaded && !loading" class="text-sm text-muted mt-0.5">
        {{ bookmarks.length }} {{ bookmarks.length === 1 ? 'template' : 'templates' }} saved
      </p>
    </header>

    <!-- Loading -->
    <div v-if="loading && !loaded" class="flex items-center justify-center py-20">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-dimmed" />
    </div>

    <!-- Empty -->
    <div v-else-if="bookmarks.length === 0" class="text-center py-20">
      <UIcon name="i-ph-bookmark-simple" class="w-12 h-12 mx-auto text-dimmed" />
      <h3 class="mt-4 text-lg font-medium">No bookmarks yet</h3>
      <p class="mt-2 text-muted max-w-md mx-auto">
        Save templates by tapping the bookmark icon on any recipe.
      </p>
      <UButton to="/search" class="mt-5" size="lg" icon="i-ph-magnifying-glass">
        Browse templates
      </UButton>
    </div>

    <!-- Grid -->
    <div v-else class="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
      <NuxtLink
        v-for="video in bookmarks"
        :key="video.id"
        :to="`/recipe/${video.id}`"
        class="group block break-inside-avoid mb-4 bg-default rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
      >
        <div class="relative aspect-9/16 bg-neutral-100">
          <video
            :src="getVideoUrl(video.video_path)"
            class="w-full h-full object-cover"
            preload="metadata"
            muted
            playsinline
          />
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <UIcon name="i-ph-play-circle-fill" class="w-12 h-12 text-white drop-shadow-lg" />
          </div>
          <div
            v-if="video.is_premium"
            class="absolute top-2 left-2 bg-primary text-inverted text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider flex items-center gap-1"
          >
            <UIcon name="i-ph-crown-simple-fill" class="w-3 h-3" />
            Pro
          </div>
          <div
            v-if="formatDuration(video.duration_seconds)"
            class="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-1.5 py-0.5 rounded font-medium"
          >
            {{ formatDuration(video.duration_seconds) }}
          </div>
        </div>

        <div class="p-3">
          <p class="text-sm font-medium line-clamp-2 text-default">
            {{ video.title || video.creator_handle || 'Untitled' }}
          </p>
          <div v-if="video.creator_handle" class="text-xs text-muted mt-0.5">
            @{{ video.creator_handle }}
          </div>
          <div v-if="(video.semantic_tags || []).length" class="flex flex-wrap gap-1 mt-2">
            <UBadge
              v-for="tag in (video.semantic_tags || []).slice(0, 3)"
              :key="tag"
              size="xs"
              color="neutral"
              variant="subtle"
            >
              {{ tag }}
            </UBadge>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
