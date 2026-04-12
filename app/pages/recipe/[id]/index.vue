<script setup lang="ts">
import type { LockedRecipe, VideoWithSegments, Segment, SkeletalLogicAnalysis, SkeletalLogicSegmentAnalysis, VideoVisualAnalysis, SegmentVisualAnalysis } from '~/types'

const route = useRoute()
const videoId = route.params.id as string

const { getVideoUrl } = useVideos()
const { authHeaders, isAuthenticated } = useAuth()
const { isBookmarked, toggleBookmark, fetchBookmarks, loaded: bookmarksLoaded } = useBookmarks()

type RecipeResponse = VideoWithSegments | LockedRecipe

const recipe = ref<RecipeResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const currentSegment = ref<Segment | null>(null)
const playerRef = ref<{ seek: (time: number) => void } | null>(null)

function seekTo(time: number) {
  playerRef.value?.seek(time)
}

async function loadRecipe() {
  loading.value = true
  error.value = null

  try {
    const result = await $fetch<{ data: RecipeResponse }>(`/api/recipes/${videoId}`, {
      headers: authHeaders()
    })
    recipe.value = result.data
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Recipe not found'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadRecipe()
  if (isAuthenticated.value && !bookmarksLoaded.value) fetchBookmarks()
})

const bookmarkBusy = ref(false)
async function onToggleBookmark() {
  if (!fullRecipe.value || bookmarkBusy.value) return
  bookmarkBusy.value = true
  try {
    await toggleBookmark(fullRecipe.value)
  } finally {
    bookmarkBusy.value = false
  }
}

const isLocked = computed(() => recipe.value !== null && 'locked' in recipe.value && recipe.value.locked === true)
const fullRecipe = computed<VideoWithSegments | null>(() => (isLocked.value ? null : (recipe.value as VideoWithSegments | null)))
const lockedRecipe = computed<LockedRecipe | null>(() => (isLocked.value ? (recipe.value as LockedRecipe) : null))

const videoUrl = computed(() =>
  recipe.value ? getVideoUrl(recipe.value.video_path) : ''
)

const skeletalLogic = computed<SkeletalLogicAnalysis | null>(() =>
  fullRecipe.value?.skeletal_logic as unknown as SkeletalLogicAnalysis ?? null
)

const visualAnalysis = computed<VideoVisualAnalysis | null>(() =>
  fullRecipe.value?.visual_analysis as unknown as VideoVisualAnalysis ?? null
)

function getSkeletalSegment(index: number): SkeletalLogicSegmentAnalysis | null {
  return skeletalLogic.value?.segments?.[index] ?? null
}

function getVisualSegment(index: number): SegmentVisualAnalysis | null {
  return visualAnalysis.value?.segments?.[index] ?? null
}
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-neutral-400" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="max-w-md mx-auto py-20 px-4 text-center">
      <UAlert color="error" :title="error" />
      <UButton to="/" class="mt-4" variant="soft">
        Back to Library
      </UButton>
    </div>

    <!-- Paywall -->
    <PaywallCard
      v-else-if="lockedRecipe"
      :recipe="lockedRecipe"
      :video-url="videoUrl"
    />

    <!-- Full recipe -->
    <div v-else-if="fullRecipe" class="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto">
      <aside class="lg:w-80 shrink-0">
        <div class="lg:sticky lg:top-6 space-y-4">
          <div class="aspect-9/16 bg-black rounded-2xl overflow-hidden shadow-sm ring-1 ring-neutral-200">
            <VideoPlayer
              ref="playerRef"
              :src="videoUrl"
              :segments="fullRecipe.segments"
              @segment-change="(s: Segment | null) => currentSegment = s"
            />
          </div>

            <div class="flex items-center justify-between gap-2 mt-1.5">
              <div v-if="fullRecipe.creator_handle" class="flex items-center gap-1.5 text-sm text-muted">
                <UIcon name="i-ph-user-circle" class="w-4 h-4" />
                <span>@{{ fullRecipe.creator_handle }}</span>
                <span v-if="fullRecipe.platform" class="text-dimmed">·</span>
                <span v-if="fullRecipe.platform" class="text-dimmed">{{ fullRecipe.platform }}</span>
              </div>
              <UButton
                v-if="isAuthenticated"
                :icon="isBookmarked(fullRecipe.id) ? 'i-ph-bookmark-simple-fill' : 'i-ph-bookmark-simple'"
                size="sm"
                variant="ghost"
                color="neutral"
                :loading="bookmarkBusy"
                :class="isBookmarked(fullRecipe.id) ? 'text-primary' : ''"
                :aria-label="isBookmarked(fullRecipe.id) ? 'Remove bookmark' : 'Bookmark recipe'"
                @click="onToggleBookmark"
              />
            </div>

          <div v-if="(fullRecipe.semantic_tags || []).length" class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="tag in fullRecipe.semantic_tags"
              :key="tag"
              size="sm"
              color="neutral"
              variant="subtle"
            >
              {{ tag }}
            </UBadge>
          </div>
        </div>
      </aside>

      <div class="flex-1 min-w-0 space-y-8">
        <RecipeScriptTemplate :blueprint="fullRecipe.script_blueprint" />

        <section v-if="fullRecipe.segments.length > 0">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed mb-3">Step-by-Step Breakdown</h2>
          <div class="space-y-2">
            <RecipeSegmentCard
              v-for="(segment, index) in fullRecipe.segments"
              :key="segment.id"
              :segment="segment"
              :segment-index="index"
              :skeletal-logic-segment="getSkeletalSegment(index)"
              :visual-segment="getVisualSegment(index)"
              @seek="seekTo"
            />
          </div>
        </section>

      </div>
    </div>
  </div>
</template>
