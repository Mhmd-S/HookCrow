<script setup lang="ts">
import type { Video } from '~/types'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  videos: Video[]
  loading?: boolean
  query?: string
  tag?: string
}>(), {
  subtitle: '',
  loading: false,
  query: '',
  tag: ''
})

const { getVideoUrl } = useVideos()
const { isPro, isAdmin } = useAuth()

const scroller = ref<HTMLElement | null>(null)

const seeAllTo = computed(() => {
  const q: Record<string, string> = {}
  if (props.query) q.q = props.query
  if (props.tag) q.tag = props.tag
  return { path: '/search', query: q }
})

function isLocked(video: { is_premium?: boolean | null }): boolean {
  return !!video.is_premium && !isPro.value && !isAdmin.value
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds >= 3600) return null
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

function scrollBy(direction: 1 | -1) {
  const el = scroller.value
  if (!el) return
  el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
}
</script>

<template>
  <section v-if="loading || videos.length > 0" class="space-y-3">
    <header class="flex items-end justify-between gap-4">
      <div>
        <h2 class="text-lg md:text-xl font-semibold tracking-tight text-default">
          {{ title }}
        </h2>
        <p v-if="subtitle" class="text-sm text-muted mt-0.5">
          {{ subtitle }}
        </p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          class="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-full bg-default ring-1 ring-default hover:bg-muted text-default transition-colors"
          aria-label="Scroll left"
          @click="scrollBy(-1)"
        >
          <UIcon name="i-ph-caret-left" class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-full bg-default ring-1 ring-default hover:bg-muted text-default transition-colors"
          aria-label="Scroll right"
          @click="scrollBy(1)"
        >
          <UIcon name="i-ph-caret-right" class="w-4 h-4" />
        </button>
        <NuxtLink
          :to="seeAllTo"
          class="ml-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          See all
          <UIcon name="i-ph-arrow-right" class="w-4 h-4" />
        </NuxtLink>
      </div>
    </header>

    <div
      ref="scroller"
      class="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-4 px-4 md:-mx-6 md:px-6 py-2"
    >
      <template v-if="loading && videos.length === 0">
        <div
          v-for="n in 6"
          :key="`s-${n}`"
          class="shrink-0 w-40 md:w-44 snap-start"
        >
          <div class="aspect-9/16 rounded-xl bg-elevated animate-pulse" />
          <div class="h-3 mt-2 rounded bg-elevated animate-pulse w-3/4" />
        </div>
      </template>

      <NuxtLink
        v-for="video in videos"
        v-else
        :key="video.id"
        :to="`/recipe/${video.id}`"
        class="group shrink-0 w-40 rounded-xl aspect-9/16 md:w-44 snap-start block"
      >
        <div class="relative rounded-xl overflow-hidden bg-neutral-100 ring-1 ring-default shadow-sm group-hover:shadow-lg group-hover:-translate-y-0.5 transition-all">
          <video
            :src="getVideoUrl(video.video_path)"
            class="w-full h-full object-cover"
            :class="{ 'blur-md scale-110': isLocked(video) }"
            preload="metadata"
            muted
            playsinline
          />
          <div
            v-if="isLocked(video)"
            class="absolute inset-0 bg-black/40 flex items-center justify-center"
          >
            <UIcon name="i-ph-lock-fill" class="w-7 h-7 text-white drop-shadow-lg" />
          </div>
          <div
            v-else
            class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <UIcon name="i-ph-play-circle-fill" class="w-10 h-10 text-white drop-shadow-lg" />
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
      </NuxtLink>
    </div>
  </section>
</template>
