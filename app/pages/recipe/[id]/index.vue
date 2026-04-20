<script setup lang="ts">
import type { LockedRecipe, VideoWithSegments, Segment, SkeletalLogicAnalysis, SkeletalLogicSegmentAnalysis, VideoVisualAnalysis, SegmentVisualAnalysis } from '~/types'

const route = useRoute()
const router = useRouter()
const videoId = route.params.id as string

const { getVideoUrl, updateVideo, deleteVideo } = useVideos()
const { authHeaders, isAuthenticated, isAdmin } = useAuth()
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

const statusBusy = ref(false)
async function onToggleStatus() {
  if (!fullRecipe.value || statusBusy.value) return
  const next = fullRecipe.value.status === 'complete' ? 'draft' : 'complete'
  statusBusy.value = true
  const { data, error: err } = await updateVideo(videoId, { status: next })
  statusBusy.value = false
  if (err) {
    error.value = err.message || 'Failed to update status'
    return
  }
  if (data && fullRecipe.value) fullRecipe.value.status = data.status
}

const deleteBusy = ref(false)
async function onDelete() {
  if (!fullRecipe.value || deleteBusy.value) return
  if (!confirm('Delete this recipe? This cannot be undone.')) return
  deleteBusy.value = true
  const { error: err } = await deleteVideo(videoId)
  if (err) {
    error.value = err.message || 'Failed to delete'
    deleteBusy.value = false
    return
  }
  router.push('/admin')
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
    <PaywallCard v-else-if="lockedRecipe" :recipe="lockedRecipe" :video-url="videoUrl" />

    <!-- Full recipe -->
    <div v-else-if="fullRecipe" class="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto">
      <aside class="lg:w-86 shrink-0">
          <div class="lg:sticky lg:top-6 aspect-9/16 bg-black rounded-2xl overflow-hidden shadow-sm ring-1 ring-neutral-200">
            <VideoPlayer ref="playerRef" :src="videoUrl" :segments="fullRecipe.segments"
              @segment-change="(s: Segment | null) => currentSegment = s" />
          </div>
      </aside>

      <div class="flex-1 min-w-0 space-y-6">
        <div class="flex items-start gap-3">
          <h1 v-if="fullRecipe.title" class="flex-1 text-2xl font-semibold tracking-tight text-highlighted">
            {{ fullRecipe.title }}
          </h1>
          <template v-if="isAdmin">
            <UButton
              :color="fullRecipe.status === 'complete' ? 'success' : 'warning'"
              variant="soft"
              size="md"
              :loading="statusBusy"
              :aria-label="`Status: ${fullRecipe.status}. Click to toggle.`"
              @click="onToggleStatus"
            >
              {{ fullRecipe.status === 'complete' ? 'Complete' : 'Draft' }}
            </UButton>
            <UButton
              :to="`/admin/recipes/${fullRecipe.id}`"
              icon="i-ph-pencil"
              color="neutral"
              variant="soft"
              size="md"
              aria-label="Edit recipe"
            />
            <UButton
              icon="i-ph-trash"
              color="error"
              variant="soft"
              size="md"
              :loading="deleteBusy"
              aria-label="Delete recipe"
              @click="onDelete"
            />
          </template>
          <UButton
            v-if="isAuthenticated"
            :icon="isBookmarked(fullRecipe.id) ? 'i-ph-bookmark-simple-fill' : 'i-ph-bookmark-simple'"
            :color="isBookmarked(fullRecipe.id) ? 'primary' : 'neutral'"
            variant="soft"
            size="md"
            :loading="bookmarkBusy"
            :aria-label="isBookmarked(fullRecipe.id) ? 'Remove bookmark' : 'Add bookmark'"
            @click="onToggleBookmark"
          />
        </div>

        <RecipeScriptTemplate :blueprint="fullRecipe.script_blueprint" />

        <div v-if="(fullRecipe.semantic_tags || []).length" class="flex flex-wrap gap-1.5">
          <span
            v-for="tag in fullRecipe.semantic_tags"
            :key="tag"
            class="inline-flex items-center text-[11px] font-medium tracking-wide text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full"
          >
            {{ tag }}
          </span>
        </div>

        <section v-if="fullRecipe.segments.length > 0">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed mb-3">Step-by-Step Breakdown</h2>
          <div class="space-y-2">
            <RecipeSegmentCard v-for="(segment, index) in fullRecipe.segments" :key="segment.id" :segment="segment"
              :segment-index="index" :skeletal-logic-segment="getSkeletalSegment(index)"
              :visual-segment="getVisualSegment(index)" :active="currentSegment?.id === segment.id" @seek="seekTo" />
          </div>
        </section>

      </div>
    </div>
  </div>
</template>
