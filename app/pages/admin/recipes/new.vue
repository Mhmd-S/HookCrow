<script setup lang="ts">
definePageMeta({ layout: 'blank', middleware: ['admin'] })

const router = useRouter()
const { authHeaders } = useAuth()

function handleSuccess(videoId: string) {
  router.push(`/admin/recipes/${videoId}`)
}

// --- TikTok URL ingest ---
const tiktokUrl = ref('')
const tiktokLoading = ref(false)
const tiktokError = ref<string | null>(null)

async function handleIngestUrl() {
  const url = tiktokUrl.value.trim()
  if (!url) {
    tiktokError.value = 'Enter a TikTok URL'
    return
  }
  if (!url.includes('tiktok.com')) {
    tiktokError.value = 'Enter a valid TikTok URL'
    return
  }

  tiktokLoading.value = true
  tiktokError.value = null

  try {
    const { data } = await $fetch<{ data: { videoId: string } }>('/api/admin/videos/ingest-url', {
      method: 'POST',
      body: { url },
      headers: authHeaders()
    })
    router.push(`/admin/recipes/${data.videoId}`)
  } catch (err: any) {
    const msg = err?.data?.message || err?.message || 'Failed to ingest video'
    tiktokError.value = msg
  } finally {
    tiktokLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950">
    <div class="max-w-3xl mx-auto px-4 py-8">
      <!-- Header -->
      <div class="mb-8">
        <UButton to="/admin" variant="ghost" icon="i-ph-arrow-left" class="mb-4">
          Back to Dashboard
        </UButton>
        <h1 class="text-2xl font-bold">Upload New Video</h1>
        <p class="text-neutral-500 mt-1">Upload a video to analyze into a reusable recipe template.</p>
      </div>

      <!-- Upload Form -->
      <div class="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
        <VideoUploadForm @success="handleSuccess" />
      </div>

      <!-- Divider -->
      <div class="flex items-center gap-4 my-8">
        <div class="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
        <span class="text-sm text-neutral-400">or</span>
        <div class="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
      </div>

      <!-- TikTok URL Ingest -->
      <div class="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
        <h2 class="text-lg font-semibold mb-1">Add from TikTok URL</h2>
        <p class="text-sm text-neutral-500 mb-4">Paste a TikTok video URL to automatically import and analyze it. No file upload needed &mdash; analysis may take 20&ndash;60 seconds.</p>

        <UAlert v-if="tiktokError" color="error" :title="tiktokError" class="mb-4" />

        <div class="flex gap-3">
          <UInput
            v-model="tiktokUrl"
            type="url"
            placeholder="https://www.tiktok.com/@user/video/1234567890"
            class="flex-1"
            :disabled="tiktokLoading"
            @keyup.enter="handleIngestUrl"
          />
          <UButton
            :loading="tiktokLoading"
            :disabled="tiktokLoading"
            icon="i-ph-link"
            @click="handleIngestUrl"
          >
            {{ tiktokLoading ? 'Importing...' : 'Import' }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
