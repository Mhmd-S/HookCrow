<script setup lang="ts">
const props = withDefaults(defineProps<{
  url: string
  poster?: string
}>(), {
  poster: undefined
})

const numericId = computed(() => {
  const match = props.url.match(/\/video\/(\d+)/)
  return match ? match[1] : null
})

const embedSrc = computed(() => {
  return numericId.value
    ? `https://www.tiktok.com/embed/v2/${numericId.value}`
    : null
})
</script>

<template>
  <div class="w-full h-full flex items-center justify-center bg-black rounded-lg overflow-hidden">
    <!-- TikTok embed iframe -->
    <iframe
      v-if="embedSrc"
      :src="embedSrc"
      class="w-full h-full max-w-[340px] mx-auto"
      style="aspect-ratio: 9/16;"
      allow="autoplay; fullscreen"
      loading="lazy"
      frameborder="0"
      allowfullscreen
    />

    <!-- Fallback: poster image or link -->
    <div v-else class="flex flex-col items-center justify-center gap-3 p-4 text-center">
      <img
        v-if="poster"
        :src="poster"
        alt="Video thumbnail"
        class="max-w-[240px] max-h-[320px] rounded object-cover"
      />
      <a
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-primary-500 underline hover:text-primary-400"
      >
        View on TikTok
      </a>
    </div>
  </div>
</template>
