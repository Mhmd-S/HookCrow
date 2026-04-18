<script setup lang="ts">
const { videos, loadBrowse } = useBrowse()
const router = useRouter()

onMounted(() => {
  // Populate the hero's floating thumbnails. No filters — we just want a
  // visually varied sample of the library.
  loadBrowse()
})

function selectDomain(domain: string | null) {
  router.push({ path: '/search', query: domain ? { tag: domain } : {} })
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-8 space-y-10">
    <LandingHero :videos="videos" />
  </div>
</template>
