<script setup lang="ts">
import type { LockedRecipe, VideoWithSegments, Segment, SkeletalLogicAnalysis, SkeletalLogicSegmentAnalysis } from '~/types'

const route = useRoute()
const videoId = route.params.id as string

const { getVideoUrl } = useVideos()
const { authHeaders } = useAuth()

type RecipeResponse = VideoWithSegments | LockedRecipe

const recipe = ref<RecipeResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const currentSegment = ref<Segment | null>(null)

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

onMounted(loadRecipe)

const isLocked = computed(() => recipe.value !== null && 'locked' in recipe.value && recipe.value.locked === true)
const fullRecipe = computed<VideoWithSegments | null>(() => (isLocked.value ? null : (recipe.value as VideoWithSegments | null)))
const lockedRecipe = computed<LockedRecipe | null>(() => (isLocked.value ? (recipe.value as LockedRecipe) : null))

const videoUrl = computed(() =>
  recipe.value ? getVideoUrl(recipe.value.video_path) : ''
)

const skeletalLogic = computed<SkeletalLogicAnalysis | null>(() =>
  fullRecipe.value?.skeletal_logic as unknown as SkeletalLogicAnalysis ?? null
)

function getSkeletalSegment(index: number): SkeletalLogicSegmentAnalysis | null {
  return skeletalLogic.value?.segments?.[index] ?? null
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
              :src="videoUrl"
              :segments="fullRecipe.segments"
              @segment-change="(s: Segment | null) => currentSegment = s"
            />
          </div>

          <div>
            <h1 class="text-xl font-bold text-default leading-tight">
              {{ fullRecipe.title || fullRecipe.creator_handle || 'Video Recipe' }}
            </h1>
            <div v-if="fullRecipe.creator_handle" class="flex items-center gap-1.5 mt-1.5 text-sm text-muted">
              <UIcon name="i-ph-user-circle" class="w-4 h-4" />
              <span>@{{ fullRecipe.creator_handle }}</span>
              <span v-if="fullRecipe.platform" class="text-dimmed">·</span>
              <span v-if="fullRecipe.platform" class="text-dimmed">{{ fullRecipe.platform }}</span>
            </div>
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
        <section v-if="skeletalLogic?.overview">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed mb-2">Overview</h2>
          <p class="text-base leading-relaxed text-default">{{ skeletalLogic.overview }}</p>
        </section>

        <RecipeScriptTemplate :blueprint="fullRecipe.script_blueprint" />

        <section v-if="fullRecipe.segments.length > 0">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed mb-3">Step-by-Step Breakdown</h2>
          <div class="space-y-4">
            <RecipeSegmentCard
              v-for="(segment, index) in fullRecipe.segments"
              :key="segment.id"
              :segment="segment"
              :segment-index="index"
              :skeletal-logic-segment="getSkeletalSegment(index)"
            />
          </div>
        </section>

        <section v-if="skeletalLogic?.keyTakeaways?.length">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-dimmed mb-2">Key Takeaways</h2>
          <ul class="space-y-2">
            <li
              v-for="(item, idx) in skeletalLogic.keyTakeaways"
              :key="idx"
              class="flex items-start gap-2 text-sm text-default leading-relaxed"
            >
              <UIcon name="i-ph-sparkle" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
