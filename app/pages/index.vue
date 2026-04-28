<script setup lang="ts">
import type { Video } from '~/types'

useSeoMeta({
  title: 'Short-form marketing video reference library',
  description: 'Browse thousands of short-form marketing videos from creators who sell. A creative reference library of hooks, bridges, and CTAs for your next campaign.',
  ogTitle: 'Hookcrow — Creative reference for short-form marketing videos',
  ogDescription: 'Thousands of real creator videos — hooks, bridges, and CTAs you can reference for your next campaign.',
  twitterTitle: 'Hookcrow — Creative reference for short-form marketing videos',
  twitterDescription: 'Thousands of real creator videos — hooks, bridges, and CTAs you can reference for your next campaign.'
})

useCanonical()

const { public: pub } = useRuntimeConfig()
const siteUrl = (pub.siteUrl || '').replace(/\/$/, '')

useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Hookcrow',
        url: siteUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${siteUrl}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Hookcrow',
        url: siteUrl,
        logo: `${siteUrl}/icon.svg`
      }
    ])
  }]
})

const { videos, loadBrowse } = useBrowse()
const { authHeaders } = useAuth()

interface SliderPreset {
  title: string
  subtitle: string
  tag?: string
  limit: number
}

const PRESETS: SliderPreset[] = [
  { title: 'Health & fitness', subtitle: 'Supplement, coaching and wellness angles', tag: 'Health & Fitness', limit: 8 },
  { title: 'Food & cooking', subtitle: 'Recipes, meal prep and food brand storytelling', tag: 'Food & Cooking', limit: 8 },
  { title: 'Finance', subtitle: 'Money, investing and personal finance angles that convert', tag: 'Finance', limit: 8 },
  { title: 'Business', subtitle: 'Founder stories, B2B pitches and growth plays', tag: 'Business', limit: 8 },
  { title: 'Beauty & fashion', subtitle: 'DTC beauty and style product storytelling', tag: 'Beauty & Fashion', limit: 8 }
]

const sliderSentinels = ref<(HTMLElement | null)[]>([])
const sliderInView = ref<boolean[]>(PRESETS.map((_, i) => i === 0))

const sliderVideos = ref<Video[][]>(PRESETS.map(() => []))
const slidersLoading = ref(true)

onMounted(async () => {
  // Populate the hero's floating thumbnails. No filters — we just want a
  // visually varied sample of the library.
  loadBrowse()

  // Set up intersection observers for lazy-mounting sliders below the fold
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const idx = sliderSentinels.value.indexOf(entry.target as HTMLElement)
        if (idx !== -1 && entry.isIntersecting) {
          sliderInView.value[idx] = true
          observer.unobserve(entry.target)
        }
      })
    },
    { rootMargin: '200px' }
  )

  // Observe all sentinels except the first (which is eager-loaded)
  nextTick(() => {
    sliderSentinels.value.forEach((el, idx) => {
      if (idx > 0 && el) observer.observe(el)
    })
  })

  // Over-fetch per tag (3x the display limit) so we have buffer to drop
  // videos already claimed by higher-priority sliders without running out.
  const pools = await Promise.all(PRESETS.map(async (preset) => {
    const params = new URLSearchParams()
    if (preset.tag) params.set('tags', preset.tag)
    params.set('limit', String(preset.limit * 3))
    try {
      const res = await $fetch<{ data: Video[] }>(`/api/browse?${params.toString()}`, {
        headers: authHeaders()
      })
      return res.data || []
    } catch {
      return [] as Video[]
    }
  }))

  // Walk presets in order, claim each video once. Earlier sliders win, so
  // "Freshly added" gets the newest; tag sliders pick the best remaining.
  const claimed = new Set<string>()
  sliderVideos.value = PRESETS.map((preset, i) => {
    const chosen: Video[] = []
    for (const v of pools[i] || []) {
      if (claimed.has(v.id)) continue
      chosen.push(v)
      claimed.add(v.id)
      if (chosen.length >= preset.limit) break
    }
    return chosen
  })
  slidersLoading.value = false
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-12">
    <LandingHero :videos="videos" />

    <div
      v-for="(preset, i) in PRESETS"
      :key="preset.title"
      :ref="el => { if (el) sliderSentinels[i] = el as HTMLElement }"
    >
      <LandingSearchSlider
        v-if="sliderInView[i]"
        :title="preset.title"
        :subtitle="preset.subtitle"
        :tag="preset.tag"
        :videos="sliderVideos[i] || []"
        :loading="slidersLoading"
      />
    </div>
  </div>
</template>
