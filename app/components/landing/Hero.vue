<script setup lang="ts">
import type { Video } from '~/types'

const props = defineProps<{
  videos: Video[]
}>()

const { getVideoUrl } = useVideos()
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

const floatingCards = computed(() => {
  return props.videos.slice(0, SLOTS.length).map((video, i) => ({
    video,
    slot: SLOTS[i]!
  }))
})

const EXAMPLE_QUERIES = [
  'meal planning app',
  'B2B SaaS',
  'organic skincare',
  'online course',
  'fitness coaching',
  'DTC supplement'
] as const

function goToResults(query: string) {
  const q = query.trim()
  if (!q) return
  router.push({ path: '/search', query: { q } })
}

function submit() {
  goToResults(searchQuery.value)
}
</script>

<template>
  <section class="relative overflow-hidden rounded-3xl bg-default ring-1 ring-default px-6 md:px-12 py-18 md:py-26">
    <div
      class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[60%] bg-gradient-radial from-indigo-50/60 via-transparent to-transparent blur-3xl z-0"
      aria-hidden="true"
    />

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
            :src="getVideoUrl(video.video_path)"
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
        <div class="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-elevated text-sm text-default">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Fresh templates weekly
        </div>

        <h1 class="text-4xl md:text-6xl font-semibold tracking-tight text-default leading-[1.05]">
          What are you marketing?
        </h1>

        <p class="text-base md:text-lg text-muted max-w-xl mx-auto">
          Tell us your product or service and we'll pull the hooks, bridges, and CTAs real creators used to sell it.
        </p>
      </div>

      <form class="space-y-3" @submit.prevent="submit">
        <label class="relative flex items-center h-14 md:h-16 bg-default rounded-full ring-1 ring-default shadow-sm focus-within:ring-2 focus-within:ring-primary transition-all pl-5 md:pl-6 pr-2 gap-3">
          <UIcon name="i-ph-magnifying-glass" class="w-5 h-5 text-dimmed shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="e.g. meal planning app, B2B SaaS, skincare line"
            class="flex-1 bg-transparent outline-none text-base md:text-lg placeholder:text-dimmed min-w-0"
            autofocus
          >
          <button
            type="submit"
            class="shrink-0 inline-flex items-center justify-center h-10 md:h-12 px-5 md:px-6 rounded-full bg-primary text-inverted text-sm md:text-base font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :disabled="!searchQuery.trim()"
          >
            Find templates
          </button>
        </label>

        <div class="flex flex-wrap justify-center items-center gap-2 pt-1">
          <span class="text-xs uppercase tracking-wider text-muted mr-1">Try</span>
          <button
            v-for="query in EXAMPLE_QUERIES"
            :key="query"
            type="button"
            class="px-3 py-1 rounded-full text-sm bg-default ring-1 ring-default hover:ring-accented hover:bg-muted text-default transition-colors"
            @click="goToResults(query)"
          >
            {{ query }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
