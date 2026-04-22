<script setup lang="ts">
import type { Video } from '~/types'
import { SEMANTIC_TAG_CATEGORIES } from '~/types'

const props = defineProps<{
  videos: Video[]
}>()

const { getVideoThumbnailUrl } = useVideos()
const router = useRouter()

const searchQuery = ref('')

const SLOTS = [
  { pos: 'top-[4%] left-[1%]',      rot: '-7deg', w: 'w-28 lg:w-32' },
  { pos: 'top-[6%] right-[2%]',     rot: '5deg',  w: 'w-32 lg:w-36' },
  { pos: 'top-[28%] left-[4%]',     rot: '-4deg', w: 'w-28 lg:w-32' },
  { pos: 'top-[26%] right-[6%]',    rot: '8deg',  w: 'w-28 lg:w-32' },
  { pos: 'bottom-[12%] left-[2%]',  rot: '6deg',  w: 'w-32 lg:w-36' },
  { pos: 'bottom-[14%] right-[3%]', rot: '-5deg', w: 'w-32 lg:w-36' },
] as const

const MOBILE_FAN_ROTATIONS = [-20, 0, 22, 42] as const

const floatingCards = computed(() => {
  return props.videos.slice(0, SLOTS.length).map((video, i) => ({
    video,
    slot: SLOTS[i]!
  }))
})

const mobileLeftFan = computed(() =>
  props.videos.slice(0, 4).map((video, i) => ({ video, rot: MOBILE_FAN_ROTATIONS[i]! }))
)

const mobileRightFan = computed(() =>
  props.videos.slice(4, 8).map((video, i) => ({ video, rot: -MOBILE_FAN_ROTATIONS[i]! }))
)

// Chips surface different search *formats* (Tutorial, Review, Transformation…)
// rather than content domains (Education, Business…), since domains are already
// rendered as sliders below. Only format tags that actually appear on videos
// are shown, so every chip is guaranteed to return results.
const FORMAT_TAG_SET = new Set<string>(SEMANTIC_TAG_CATEGORIES.format)

const recommendations = computed<string[]>(() => {
  const counts = new Map<string, number>()
  for (const video of props.videos) {
    for (const tag of video.semantic_tags || []) {
      if (!tag || !FORMAT_TAG_SET.has(tag)) continue
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag]) => tag)
})

function goToQuery(query: string) {
  const q = query.trim()
  if (!q) return
  router.push({ path: '/search', query: { q } })
}

function goToTag(tag: string) {
  router.push({ path: '/search', query: { tag } })
}

function submit() {
  goToQuery(searchQuery.value)
}
</script>

<template>
  <section class="relative overflow-hidden rounded-3xl bg-default ring-1 ring-default px-6 md:px-12 py-18 md:py-26">
    <div
      class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[60%] bg-gradient-radial from-indigo-50/60 via-transparent to-transparent blur-3xl z-0"
      aria-hidden="true"
    />

    <div class="md:hidden absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        v-for="({ video, rot }, i) in mobileLeftFan"
        :key="'ml-' + video.id"
        class="absolute top-6 left-5 w-12 origin-top-left rounded-md shadow-md ring-1 ring-default bg-default overflow-hidden"
        :style="{ transform: `rotate(${-rot}deg)`, zIndex: 10 - i }"
      >
        <div class="relative aspect-9/16 bg-neutral-100">
          <video
            :src="getVideoThumbnailUrl(video.video_path)"
            class="w-full h-full object-cover"
            preload="metadata"
            muted
            playsinline
          />
        </div>
      </div>
      <div
        v-for="({ video, rot }, i) in mobileRightFan"
        :key="'mr-' + video.id"
        class="absolute top-6 right-5 w-12 origin-top-right rounded-md shadow-md ring-1 ring-default bg-default overflow-hidden"
        :style="{ transform: `rotate(${-rot}deg)`, zIndex: 10 - i }"
      >
        <div class="relative aspect-9/16 bg-neutral-100">
          <video
            :src="getVideoThumbnailUrl(video.video_path)"
            class="w-full h-full object-cover"
            preload="metadata"
            muted
            playsinline
          />
        </div>
      </div>
    </div>

    <div class="hidden md:block absolute inset-0 pointer-events-none" aria-hidden="true">
      <div
        v-for="{ video, slot } in floatingCards"
        :key="video.id"
        class="absolute rounded-xl shadow-lg ring-1 ring-default bg-default overflow-hidden"
        :class="[slot.pos, slot.w]"
        :style="{ transform: `rotate(${slot.rot})` }"
      >
        <div class="relative aspect-9/16 bg-neutral-100">
          <video
            :src="getVideoThumbnailUrl(video.video_path)"
            class="w-full h-full object-cover"
            preload="metadata"
            muted
            playsinline
          />
        </div>
      </div>
    </div>

    <div class="relative z-10 max-w-2xl mx-auto text-center space-y-8">
      <div class="space-y-5">
        <h1 class="text-4xl md:text-6xl font-semibold tracking-tight text-default leading-[1.05]">
          Creative reference for short-form marketing videos
        </h1>

        <p class="text-base md:text-lg text-muted max-w-xl mx-auto">
          Tell us what you're marketing and we'll surface real creator videos — hooks, bridges, and CTAs you can reference for your next campaign.
        </p>
      </div>

      <form class="space-y-3" @submit.prevent="submit">
        <label class="relative flex items-center h-14 md:h-16 bg-default rounded-full ring-1 ring-default shadow-sm focus-within:ring-2 focus-within:ring-primary transition-all pl-4 md:pl-6 pr-2 gap-2 md:gap-3">
          <UIcon name="i-ph-magnifying-glass" class="w-5 h-5 text-dimmed shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Product, service or niche…"
            class="flex-1 bg-transparent outline-none text-base md:text-lg placeholder:text-dimmed min-w-0"
          >
          <button
            type="submit"
            aria-label="Find templates"
            class="shrink-0 inline-flex items-center justify-center h-10 md:h-12 w-10 md:w-auto md:px-6 rounded-full bg-primary text-inverted text-sm md:text-base font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :disabled="!searchQuery.trim()"
          >
            <UIcon name="i-ph-arrow-right" class="w-5 h-5 md:hidden" />
            <span class="hidden md:inline">Find templates</span>
          </button>
        </label>

        <div v-if="recommendations.length" class="flex flex-wrap justify-center items-center gap-2 pt-1">
          <span class="text-xs uppercase tracking-wider text-muted mr-1">Try</span>
          <button
            v-for="tag in recommendations"
            :key="tag"
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-default ring-1 ring-default hover:ring-accented hover:bg-muted text-default transition-colors"
            @click="goToTag(tag)"
          >
            <UIcon name="i-ph-tag" class="w-3.5 h-3.5 text-dimmed" />
            {{ tag }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
