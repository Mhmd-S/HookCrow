<script setup lang="ts">
import type { VideoWithSegments, Segment, SkeletalLogicAnalysis, SkeletalLogicSegmentAnalysis, VideoVisualAnalysis, SegmentVisualAnalysis } from '~/types'

const route = useRoute()
const router = useRouter()
const videoId = route.params.id as string

const { getVideoUrl, getVideoThumbnailImgUrl, updateVideo, deleteVideo } = useVideos()
const { authHeaders, isAdmin } = useAuth()

type RecipeResponse = VideoWithSegments

const recipe = ref<RecipeResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const currentSegment = ref<Segment | null>(null)
const playerRef = ref<{
  seek: (time: number) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  playing: boolean
} | null>(null)

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

// The library is open, so SSR fetches the same full recipe every visitor and
// crawler sees. Fetching it during SSR is what puts the title, description,
// og: tags and JSON-LD into the served HTML; link-preview bots (Twitter, Slack,
// LinkedIn) never run our JS.
const { data: ssrRecipe, error: ssrError } = await useAsyncData<RecipeResponse>(
  `recipe:${videoId}`,
  () => $fetch<{ data: RecipeResponse }>(`/api/recipes/${videoId}`).then(res => res.data)
)

if (ssrRecipe.value) {
  recipe.value = ssrRecipe.value
  loading.value = false
} else if (ssrError.value) {
  // A missing or unpublished recipe must answer 404, not a 200 shell — a soft
  // 404 is indexable. Other failures fall through to a client retry.
  const status = (ssrError.value as { statusCode?: number }).statusCode
  if (status === 404) {
    throw createError({ statusCode: 404, statusMessage: 'Recipe not found', fatal: true })
  }
}

onMounted(() => {
  if (!recipe.value) loadRecipe()
})

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

const fullRecipe = computed<VideoWithSegments | null>(() => recipe.value)

const videoUrl = computed(() =>
  recipe.value && recipe.value.video_path ? getVideoUrl(recipe.value.video_path) : ''
)

const { public: pub } = useRuntimeConfig()
const siteUrl = computed(() => (pub.siteUrl || '').replace(/\/$/, ''))

// ── SEO: meta ──────────────────────────────────────────────
// Titles are raw captions scraped from TikTok — typically a sentence followed by
// a 300-char hashtag block. Unusable as-is in a SERP, so strip the tag spam and
// cut to roughly what Google renders before the ellipsis.
function stripCaption(raw: string): string {
  return raw
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')       // hashtags
    .replace(/https?:\/\/\S+/g, ' ')          // stray links
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–—|·,:;.]+$/u, '')         // trailing separators
    .trim()
}

function cleanTitle(raw: string | null | undefined): string | null {
  if (!raw) return null
  const stripped = stripCaption(raw)
  if (!stripped) return null
  if (stripped.length <= 65) return stripped
  const cut = stripped.slice(0, 65)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

// nuxt.config sets titleTemplate '%s · Hookcrow' — `title` must stay unsuffixed.
// og:/twitter: titles bypass titleTemplate, so they carry the suffix themselves.
const pageTitle = computed(() => {
  const cleaned = cleanTitle(fullRecipe.value?.title)
  if (cleaned) return cleaned
  // No usable caption — fall back to something descriptive rather than "Recipe".
  const r = fullRecipe.value
  const handle = r?.creator_handle ? `@${r.creator_handle}` : null
  const platform = r?.platform
  if (handle && platform) return `${platform} ad breakdown by ${handle}`
  if (handle) return `Ad breakdown by ${handle}`
  return 'Video recipe'
})
const socialTitle = computed(() => `${pageTitle.value} · Hookcrow`)

const seoSource = computed(() => {
  const r = fullRecipe.value
  if (!r) return null
  const skeletal = fullRecipe.value?.skeletal_logic
  const overview = skeletal && typeof skeletal === 'object'
    ? ((skeletal as unknown as SkeletalLogicAnalysis).overview || null)
    : null
  return {
    title: r.title,
    description: r.description,
    creator_handle: r.creator_handle,
    platform: r.platform,
    duration_seconds: r.duration_seconds,
    semantic_tags: r.semantic_tags,
    thumbnail_path: r.thumbnail_path,
    thumbnail_url: r.thumbnail_url,
    created_at: r.created_at,
    updated_at: r.updated_at,
    summary: overview ?? r.description ?? null
  }
})

const seoDescription = computed(() => {
  const r = seoSource.value
  if (!r) return 'Short-form marketing video recipe with script breakdown and creative analysis.'

  const parts: string[] = []
  if (r.creator_handle) parts.push(`@${r.creator_handle}`)
  if (r.platform) parts.push(r.platform)
  if (r.summary) parts.push(r.summary)

  const tags = (r.semantic_tags || []).slice(0, 4)
  if (tags.length) parts.push(tags.join(', '))

  const raw = parts.join(' — ')
  if (raw.length <= 160) return raw
  const cut = raw.slice(0, 160)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim()}…`
})

const seoThumbnail = computed(() => {
  const fallback = `${siteUrl.value}/og-image.png`
  const r = seoSource.value
  if (!r) return fallback
  // Uploads carry thumbnail_path; embeds carry an external thumbnail_url.
  const url = r.thumbnail_path ? getVideoThumbnailImgUrl(r.thumbnail_path) : r.thumbnail_url
  if (!url) return fallback
  // og:image must be absolute; a misconfigured SUPABASE_URL yields "undefined/..."
  return url.startsWith('http') ? url : fallback
})

useSeoMeta({
  title: () => pageTitle.value,
  description: () => seoDescription.value,
  ogTitle: () => socialTitle.value,
  ogDescription: () => seoDescription.value,
  ogImage: () => seoThumbnail.value,
  ogType: 'article',
  twitterTitle: () => socialTitle.value,
  twitterDescription: () => seoDescription.value,
  twitterImage: () => seoThumbnail.value,
  twitterCard: 'summary_large_image'
})

useCanonical(`/recipe/${videoId}`)

// ── SEO: structured data ───────────────────────────────────
const structuredData = computed(() => {
  const r = seoSource.value
  if (!r) return null

  const duration = r.duration_seconds
    ? `PT${Math.floor(r.duration_seconds / 60)}M${Math.round(r.duration_seconds % 60)}S`
    : undefined

  const datePublished = r.created_at ? new Date(r.created_at).toISOString() : undefined
  const dateModified = r.updated_at ? new Date(r.updated_at).toISOString() : datePublished
  const name = pageTitle.value
  const pageUrl = `${siteUrl.value}/recipe/${videoId}`
  const author = r.creator_handle
    ? { '@type': 'Person', name: r.creator_handle }
    : undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': pageUrl,
    url: pageUrl,
    headline: name,
    description: seoDescription.value,
    image: seoThumbnail.value,
    datePublished,
    dateModified,
    author,
    publisher: {
      '@type': 'Organization',
      name: 'Hookcrow',
      logo: { '@type': 'ImageObject', url: `${siteUrl.value}/icon.svg` }
    },
    about: (r.semantic_tags || []).slice(0, 8).map(tag => ({
      '@type': 'Thing', name: tag
    })),
    isAccessibleForFree: true,
    ...(videoUrl.value ? {
      video: {
        '@type': 'VideoObject',
        name,
        description: seoDescription.value,
        thumbnailUrl: seoThumbnail.value,
        contentUrl: videoUrl.value,
        uploadDate: datePublished,
        duration,
        ...(author ? { creator: author } : {})
      }
    } : {})
  }
})

useHead({
  script: () => structuredData.value ? [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify(structuredData.value)
  }] : []
})

// The on-page heading keeps the whole caption, minus the hashtag block.
const displayTitle = computed(() => {
  const raw = fullRecipe.value?.title
  return (raw && stripCaption(raw)) || 'Untitled ad'
})

const posterUrl = computed(() => {
  const r = fullRecipe.value
  if (!r) return null
  return r.thumbnail_path ? getVideoThumbnailImgUrl(r.thumbnail_path) : (r.thumbnail_url || null)
})

const sourceUrl = computed(() => fullRecipe.value?.source_url || null)

// Only a hosted file plays here. Rows without one show the poster until the
// video backfill fills video_path.
const seekable = computed(() => !!videoUrl.value)

const formulaName = computed(() => fullRecipe.value?.logic_flow?.name ?? null)
const formulaDescription = computed(() => fullRecipe.value?.logic_flow?.description ?? null)

const summary = computed(() => skeletalLogic.value?.overview || fullRecipe.value?.description || null)

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

// ── Player: playback state and the docked mini-player (phones) ──
const playhead = ref(0)
const playerDuration = ref(0)
const playing = computed(() => playerRef.value?.playing ?? false)

// Below lg the player scrolls away with the page. Once someone has pressed
// play, it docks to a strip at the top so segment taps stay watchable.
const isMobile = ref(false)
const mediaSlot = ref<HTMLElement | null>(null)
const mediaInView = ref(true)
const dockArmed = ref(false)

watch(playing, (p) => {
  if (p) dockArmed.value = true
})

const docked = computed(() =>
  isMobile.value && seekable.value && dockArmed.value && !mediaInView.value
)

// Dock strip height plus breathing room, so a segment scrolled into view
// does not land under it.
const DOCK_OFFSET = 144

let mediaQuery: MediaQueryList | null = null
let observer: IntersectionObserver | null = null
function onMediaQuery() {
  isMobile.value = !!mediaQuery?.matches
}

onMounted(() => {
  mediaQuery = window.matchMedia('(max-width: 1023.98px)')
  onMediaQuery()
  mediaQuery.addEventListener('change', onMediaQuery)
  observer = new IntersectionObserver(
    ([entry]) => { mediaInView.value = !!entry && entry.intersectionRatio >= 0.6 },
    { threshold: [0, 0.6, 1] }
  )
  if (mediaSlot.value) observer.observe(mediaSlot.value)
})

// The slot only exists once the recipe renders (it may load after mount).
watch(mediaSlot, (el, prev) => {
  if (!observer) return
  if (prev) observer.unobserve(prev)
  if (el) observer.observe(el)
}, { flush: 'post' })

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', onMediaQuery)
  observer?.disconnect()
})

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function scrollToY(el: Element, offset: number) {
  const top = el.getBoundingClientRect().top + window.scrollY - offset
  window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() })
}

function scrollToPlayer() {
  if (mediaSlot.value) scrollToY(mediaSlot.value, 12)
}

function closeDock() {
  playerRef.value?.pause()
  dockArmed.value = false
}

function jumpToSegment(segment: Segment) {
  if (seekable.value) {
    playerRef.value?.seek(segment.start_time)
    playerRef.value?.play()
  }
  currentSegment.value = segment
  const card = document.getElementById(`seg-${segment.id}`)
  if (card) scrollToY(card, isMobile.value && seekable.value ? DOCK_OFFSET : 24)
}

function seekTo(time: number) {
  playerRef.value?.seek(time)
  playerRef.value?.play()
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const SEGMENT_DOT: Record<string, string> = {
  Hook: 'bg-red-500',
  Bridge: 'bg-yellow-500',
  Value: 'bg-green-500',
  Proof: 'bg-blue-500',
  CTA: 'bg-purple-500'
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

    <!-- Full recipe. Phones read top to bottom: what this is, the video, the
         beats. From lg the video becomes a sticky rail beside the text. -->
    <div v-else-if="fullRecipe">
      <div
        class="grid gap-5 max-w-7xl mx-auto px-4 pt-2 pb-6 md:px-6 lg:grid-cols-[344px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-5 lg:py-6"
      >
        <!-- Title + meta -->
        <header class="min-w-0 space-y-3 lg:col-start-2 lg:row-start-1">
          <div v-if="isAdmin" class="flex flex-wrap items-center gap-2">
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
            >
              Edit
            </UButton>
            <UButton
              icon="i-ph-trash"
              color="error"
              variant="soft"
              size="sm"
              :loading="deleteBusy"
              @click="onDelete"
            >
              Delete
            </UButton>
          </div>

          <h1
            class="font-semibold tracking-tight text-highlighted text-balance break-words"
            :class="displayTitle.length > 90 ? 'text-lg leading-snug md:text-xl' : 'text-[22px] leading-7 md:text-2xl md:leading-8'"
          >
            {{ displayTitle }}
          </h1>

          <!-- Meta: who, where, how long -->
          <div v-if="metaParts.length" class="flex items-center gap-x-2 gap-y-1 flex-wrap text-sm text-muted">
            <template v-for="(part, i) in metaParts" :key="part">
              <span v-if="i > 0" class="text-dimmed" aria-hidden="true">·</span>
              <span class="break-all">{{ part }}</span>
            </template>
          </div>

          <!-- Which formula, in one line: answers "what am I looking at" -->
          <p v-if="formulaName" class="text-sm text-muted leading-relaxed">
            <span class="inline-flex items-center gap-1 mr-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium align-[1px]">
              <UIcon name="i-ph-flow-arrow" class="w-3.5 h-3.5" />
              {{ formulaName }}
            </span>
            <span v-if="formulaDescription">{{ formulaDescription }}</span>
          </p>

          <p v-if="summary" class="text-[15px] md:text-sm leading-relaxed text-toned">
            {{ summary }}
          </p>

          <!-- One swipeable row on phones; wraps from lg -->
          <div
            v-if="visibleTags.length"
            class="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 md:-mx-6 md:px-6 lg:mx-0 lg:px-0 lg:flex-wrap"
          >
            <span
              v-for="tag in visibleTags"
              :key="tag"
              class="shrink-0 inline-flex items-center text-xs font-medium text-muted bg-elevated px-2.5 py-1 rounded-full whitespace-nowrap"
            >
              {{ tag }}
            </span>
          </div>
        </header>

        <!-- Video rail -->
        <aside class="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <div class="lg:sticky lg:top-6 space-y-3">
            <!-- Holds the player's place in the flow while it is docked. On
                 phones the player is sized to clear the header above it and
                 the copy bar below, so the first screen shows all of it. -->
            <div
              ref="mediaSlot"
              class="lg:h-[min(612px,calc(100svh-8.5rem))]"
              :class="seekable ? 'h-[clamp(16rem,calc(100svh-24rem),32.5rem)]' : 'h-[min(40svh,340px)]'"
            >
              <template v-if="seekable">
                <div
                  :class="docked
                    ? 'fixed inset-x-0 top-0 z-40 flex gap-3 px-4 py-2 bg-default/95 backdrop-blur-md border-b border-default shadow-sm motion-safe:animate-[slide-in-from-top_180ms_ease-out]'
                    : 'h-full'"
                >
                  <div
                    class="relative shrink-0 aspect-9/16 overflow-hidden bg-black"
                    :class="docked ? 'h-28 rounded-lg' : 'h-full mx-auto rounded-2xl shadow-sm ring-1 ring-default'"
                  >
                    <VideoPlayer
                      ref="playerRef"
                      :src="videoUrl"
                      :poster="posterUrl ?? undefined"
                      :segments="fullRecipe.segments"
                      :minimal="docked"
                      class="rounded-none"
                      @timeupdate="(t: number) => playhead = t"
                      @durationchange="(d: number) => playerDuration = d"
                      @segment-change="(s: Segment | null) => currentSegment = s"
                    />
                    <button
                      v-if="docked"
                      type="button"
                      class="absolute inset-0 flex items-end justify-end p-1"
                      aria-label="Back to the full video"
                      @click="scrollToPlayer"
                    >
                      <span class="size-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                        <UIcon name="i-ph-arrow-up" class="w-3.5 h-3.5" />
                      </span>
                    </button>
                  </div>

                  <!-- Docked strip: current beat, play/pause, and the structure to jump around -->
                  <div v-if="docked" class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div class="flex items-center gap-1">
                      <div class="flex-1 min-w-0">
                        <p class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
                          <span
                            class="size-2 shrink-0 rounded-full"
                            :class="currentSegment ? (SEGMENT_DOT[currentSegment.label] ?? 'bg-neutral-400') : 'bg-neutral-300'"
                          />
                          <span class="truncate">{{ currentSegment?.label ?? (playing ? 'Playing' : 'Paused') }}</span>
                        </p>
                        <p class="text-xs tabular-nums text-muted">
                          {{ clock(playhead) }} / {{ clock(playerDuration || fullRecipe.duration_seconds || 0) }}
                        </p>
                      </div>
                      <UButton
                        :icon="playing ? 'i-ph-pause-fill' : 'i-ph-play-fill'"
                        color="primary"
                        variant="soft"
                        size="lg"
                        class="size-11 justify-center rounded-full"
                        :aria-label="playing ? 'Pause' : 'Play'"
                        @click="playerRef?.togglePlay()"
                      />
                      <UButton
                        icon="i-ph-x"
                        color="neutral"
                        variant="ghost"
                        size="lg"
                        class="size-11 justify-center -mr-2"
                        aria-label="Close mini player"
                        @click="closeDock"
                      />
                    </div>
                    <RecipeStructureBar
                      compact
                      :segments="fullRecipe.segments"
                      :active-id="currentSegment?.id ?? null"
                      :current-time="playhead"
                      @jump="jumpToSegment"
                    />
                  </div>
                </div>

                <!-- Stand-in while the player is docked, so the slot does not read as a hole -->
                <button
                  v-if="docked"
                  type="button"
                  class="relative block h-full aspect-9/16 mx-auto rounded-2xl overflow-hidden bg-elevated ring-1 ring-default"
                  @click="scrollToPlayer"
                >
                  <img
                    v-if="posterUrl"
                    :src="posterUrl"
                    alt=""
                    class="absolute inset-0 w-full h-full object-cover opacity-30"
                  >
                  <span class="absolute inset-0 flex items-center justify-center gap-1.5 px-4 text-sm font-medium text-toned">
                    <UIcon name="i-ph-arrow-up" class="w-4 h-4 shrink-0" />
                    Playing in the mini player
                  </span>
                </button>
              </template>

              <!-- No hosted video yet: poster, a calm note, and the original -->
              <div
                v-else
                class="relative h-full aspect-9/16 mx-auto rounded-2xl overflow-hidden bg-elevated ring-1 ring-default"
              >
                <img
                  v-if="posterUrl"
                  :src="posterUrl"
                  :alt="`Still from ${displayTitle}`"
                  class="absolute inset-0 w-full h-full object-cover"
                >
                <div v-else class="absolute inset-0 flex items-center justify-center">
                  <UIcon name="i-ph-film-strip" class="w-10 h-10 text-dimmed" />
                </div>
                <div class="absolute inset-x-0 bottom-0 px-3 pb-1 pt-14 bg-gradient-to-t from-black/80 via-black/50 to-transparent text-white">
                  <p class="flex items-center gap-1.5 text-sm font-medium">
                    <UIcon name="i-ph-video-camera" class="w-4 h-4 shrink-0 text-white/80" />
                    Video coming soon
                  </p>
                  <a
                    v-if="sourceUrl"
                    :href="sourceUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 h-11 text-xs text-white/75 hover:text-white underline-offset-2 hover:underline"
                  >
                    Watch original
                    <UIcon name="i-ph-arrow-up-right" class="w-3.5 h-3.5" />
                  </a>
                  <div v-else class="h-3" />
                </div>
              </div>
            </div>

            <div v-if="fullTemplate" class="hidden lg:block">
              <UButton
                :icon="templateCopied ? 'i-ph-check' : 'i-ph-copy'"
                block
                size="lg"
                color="primary"
                @click="copyFullTemplate"
              >
                {{ templateCopied ? 'Copied' : 'Copy full script template' }}
              </UButton>
            </div>
          </div>
        </aside>

        <!-- Anatomy column -->
        <div class="min-w-0 space-y-5 lg:col-start-2 lg:row-start-2">
          <!-- The ad's shape, to scale. Tap a block to play it and jump to its breakdown. -->
          <RecipeStructureBar
            :segments="fullRecipe.segments"
            :active-id="currentSegment?.id ?? null"
            :current-time="seekable ? playhead : null"
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
        </div>
      </div>

      <!-- Phones: the main action stays in reach. Sticky (not fixed) so it
           settles above the footer instead of covering it. -->
      <div
        v-if="fullTemplate"
        class="lg:hidden sticky bottom-0 z-30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-default/90 backdrop-blur-md border-t border-default"
      >
        <UButton
          :icon="templateCopied ? 'i-ph-check' : 'i-ph-copy'"
          block
          size="xl"
          :color="templateCopied ? 'success' : 'primary'"
          class="h-12"
          @click="copyFullTemplate"
        >
          {{ templateCopied ? 'Copied to clipboard' : 'Copy full script template' }}
        </UButton>
      </div>
    </div>
  </div>
</template>
