<script setup lang="ts">
import type { Video } from '~/types'

const props = defineProps<{
  videos: Video[]
}>()

const { getVideoUrl } = useVideos()

const SLOTS = [
  { pos: 'top-[4%] left-[1%]',      rot: '-7deg', w: 'w-28 lg:w-32' },
  { pos: 'top-[6%] right-[2%]',     rot: '5deg',  w: 'w-32 lg:w-36' },
  { pos: 'top-[28%] left-[4%]',     rot: '-4deg', w: 'w-28 lg:w-32' },
  { pos: 'top-[26%] right-[6%]',    rot: '8deg',  w: 'w-28 lg:w-32' },
  { pos: 'bottom-[12%] left-[2%]',  rot: '6deg',  w: 'w-32 lg:w-36' },
  { pos: 'bottom-[14%] right-[3%]', rot: '-5deg', w: 'w-32 lg:w-36' },
  { pos: 'bottom-[4%] left-[20%]',  rot: '-3deg', w: 'w-24 lg:w-28' },
  { pos: 'bottom-[6%] right-[22%]', rot: '4deg',  w: 'w-24 lg:w-28' },
  { pos: 'top-[2%] left-[30%]',     rot: '-6deg', w: 'w-20 lg:w-24' },
  { pos: 'top-[4%] right-[32%]',    rot: '7deg',  w: 'w-20 lg:w-24' }
] as const

const floatingCards = computed(() => {
  return props.videos.slice(0, SLOTS.length).map((video, i) => ({
    video,
    slot: SLOTS[i]!
  }))
})
</script>

<template>
  <section class="relative overflow-hidden rounded-3xl bg-white ring-1 ring-neutral-200/70 px-6 md:px-12 py-20 md:py-32">
    <!-- Soft radial accent behind the hero column -->
    <div
      class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[60%] bg-gradient-radial from-indigo-50/60 via-transparent to-transparent blur-3xl -z-0"
      aria-hidden="true"
    />

    <!-- Floating video thumbnails (desktop only) -->
    <div class="hidden md:block absolute inset-0 pointer-events-none" aria-hidden="true">
      <div
        v-for="{ video, slot } in floatingCards"
        :key="video.id"
        class="absolute rounded-xl shadow-lg ring-1 ring-black/5 bg-white overflow-hidden"
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

    <!-- Centered content column -->
    <div class="relative z-10 max-w-2xl mx-auto text-center space-y-6">
      <div class="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-neutral-100 text-sm text-default">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        Fresh recipes weekly
      </div>

      <h1 class="text-4xl md:text-6xl font-semibold tracking-tight text-default leading-[1.05]">
        The playbook for short-form marketing video
      </h1>

      <p class="text-base md:text-lg text-muted max-w-xl mx-auto">
        Real TikToks, Reels, and Shorts — broken down into the hooks, bridges, and CTAs you can steal for your next video.
      </p>

      <div class="pt-2">
        <UButton
          to="#browse"
          size="xl"
          trailing-icon="i-ph-arrow-down"
        >
          Start Exploring
        </UButton>
      </div>
    </div>
  </section>
</template>
