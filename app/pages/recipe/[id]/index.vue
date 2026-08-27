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

useSeoMeta({
  title: () => fullRecipe.value?.title || lockedRecipe.value?.title || 'Recipe',
  robots: 'noindex,nofollow'
})

const videoUrl = computed(() =>
  recipe.value && recipe.value.video_path ? getVideoUrl(recipe.value.video_path) : ''
)

const isEmbed = computed(() =>
  fullRecipe.value ? !fullRecipe.value.video_path && fullRecipe.value.platform === 'TikTok' && !!fullRecipe.value.source_url : false
)

const embedSourceUrl = computed(() => fullRecipe.value?.source_url ?? '')
const embedThumbnailUrl = computed(() => fullRecipe.value?.thumbnail_url ?? undefined)

// Seeking only exists for hosted files; TikTok's iframe has no seek API.
const seekable = computed(() => !isEmbed.value && !!videoUrl.value)

const formulaName = computed(() => fullRecipe.value?.logic_flow?.name ?? null)

const durationLabel = computed(() => {
  const s = fullRecipe.value?.duration_seconds
  if (!s) return null
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

const metaParts = computed(() => {
  if (!fullRecipe.value) return []
  return [
    fullRecipe.value.creator_handle,
    fullRecipe.value.platform,
    durationLabel.value
  ].filter(Boolean) as string[]
})

const visibleTags = computed(() => (fullRecipe.value?.semantic_tags || []).slice(0, 6))

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

// Full reusable script: the stored blueprint, or assembled from the segments.
const fullTemplate = computed(() => {
  if (!fullRecipe.value) return ''
  if (fullRecipe.value.script_blueprint) return fullRecipe.value.script_blueprint
  const parts = fullRecipe.value.segments
    .filter(s => (s.script_blueprint || '').trim())
    .map(s => `[${s.label.toUpperCase()}]\n${s.script_blueprint!.trim()}`)
  return parts.join('\n\n')
})

const templateCopied = ref(false)
function copyFullTemplate() {
  if (!fullTemplate.value) return
  navigator.clipboard.writeText(fullTemplate.value)
  templateCopied.value = true
  setTimeout(() => (templateCopied.value = false), 2000)
}

function jumpToSegment(segment: Segment) {
  if (seekable.value) {
    playerRef.value?.seek(segment.start_time)
  }
  currentSegment.value = segment
  document.getElementById(`seg-${segment.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function seekTo(time: number) {
  playerRef.value?.seek(time)
}
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <UIcon name="i-ph-circle-notch" class="w-8 h-8 animate-spin text-dimmed" />
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
    <div v-else-if="fullRecipe" class="flex flex-col lg:flex-row gap-6 lg:gap-8 p-4 md:p-6 max-w-7xl mx-auto">
      <!-- Video rail -->
      <aside class="shrink-0 lg:w-86">
        <div class="lg:sticky lg:top-6 space-y-3">
          <div class="mx-auto w-full max-w-[340px] lg:max-w-none aspect-9/16 bg-black rounded-2xl overflow-hidden shadow-sm ring-1 ring-default">
            <VideoTikTokEmbed
              v-if="isEmbed && embedSourceUrl"
              :url="embedSourceUrl"
              :poster="embedThumbnailUrl"
            />
            <VideoPlayer v-else ref="playerRef" :src="videoUrl" :segments="fullRecipe.segments"
              @segment-change="(s: Segment | null) => currentSegment = s" />
          </div>

          <div class="mx-auto w-full max-w-[340px] lg:max-w-none space-y-2">
            <UButton
              v-if="fullTemplate"
              :icon="templateCopied ? 'i-ph-check' : 'i-ph-copy'"
              block
              color="primary"
              @click="copyFullTemplate"
            >
              {{ templateCopied ? 'Copied' : 'Copy full script template' }}
            </UButton>
            <UButton
              v-if="isEmbed && embedSourceUrl"
              :href="embedSourceUrl"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-ph-arrow-square-out"
              block
              variant="ghost"
              color="neutral"
            >
              View on TikTok
            </UButton>
          </div>
        </div>
      </aside>

      <!-- Anatomy column -->
      <div class="flex-1 min-w-0 space-y-5">
        <!-- Title + actions -->
        <header class="space-y-2">
          <div class="flex items-start gap-3">
            <h1 class="flex-1 text-xl md:text-2xl font-semibold tracking-tight text-highlighted">
              {{ fullRecipe.title || 'Untitled ad' }}
            </h1>
            <template v-if="isAdmin">
              <UButton
                :color="fullRecipe.status === 'complete' ? 'success' : 'warning'"
                variant="soft"
                size="sm"
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
                size="sm"
                aria-label="Edit recipe"
              />
              <UButton
                icon="i-ph-trash"
                color="error"
                variant="soft"
                size="sm"
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
              size="sm"
              :loading="bookmarkBusy"
              :aria-label="isBookmarked(fullRecipe.id) ? 'Remove bookmark' : 'Add bookmark'"
              @click="onToggleBookmark"
            />
          </div>

          <!-- Meta: who, where, how long, and which formula -->
          <div class="flex items-center gap-2 flex-wrap text-sm text-muted">
            <template v-for="(part, i) in metaParts" :key="part">
              <span v-if="i > 0" class="text-dimmed">·</span>
              <span>{{ part }}</span>
            </template>
            <span
              v-if="formulaName"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
            >
              <UIcon name="i-ph-flow-arrow" class="w-3.5 h-3.5" />
              {{ formulaName }}
            </span>
          </div>

          <div v-if="visibleTags.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="tag in visibleTags"
              :key="tag"
              class="inline-flex items-center text-[11px] font-medium tracking-wide text-muted bg-elevated px-2 py-0.5 rounded-full"
            >
              {{ tag }}
            </span>
          </div>
        </header>

        <!-- The ad's shape, to scale. Click a block to jump to its breakdown. -->
        <RecipeStructureBar
          :segments="fullRecipe.segments"
          :active-id="currentSegment?.id ?? null"
          @jump="jumpToSegment"
        />

        <!-- Segment breakdown -->
        <section v-if="fullRecipe.segments.length > 0">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed mb-3">The formula, beat by beat</h2>
          <div class="space-y-3">
            <RecipeSegmentCard
              v-for="(segment, index) in fullRecipe.segments"
              :key="segment.id"
              :segment="segment"
              :segment-index="index"
              :skeletal-logic-segment="getSkeletalSegment(index)"
              :visual-segment="getVisualSegment(index)"
              :active="currentSegment?.id === segment.id"
              :seekable="seekable"
              @seek="seekTo"
            />
          </div>
        </section>

        <PromoCta layout="banner" />
      </div>
    </div>
  </div>
</template>
