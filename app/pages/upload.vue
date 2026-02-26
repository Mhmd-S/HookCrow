<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const router = useRouter()
const { authHeaders } = useAuth()

const processing = ref(false)
const processingStatus = ref('')
const error = ref<string | null>(null)

async function handleSuccess(videoId: string) {
  // Auto-run full analysis pipeline
  processing.value = true
  processingStatus.value = 'Processing video...'
  error.value = null

  try {
    const headers = await authHeaders()
    const result = await $fetch<{
      success: boolean
      logicFlowName: string | null
      segmentCount: number
      analysisFailures: number
    }>('/api/process-video-full', {
      method: 'POST',
      body: { videoId },
      headers
    })

    if (result.success) {
      processingStatus.value = `Done! ${result.logicFlowName || 'Analyzed'} with ${result.segmentCount} segments`
      setTimeout(() => {
        router.push(`/recipe/${videoId}`)
      }, 1000)
    }
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Processing failed'
    processing.value = false
    // Still navigate to recipe card — partial results may be available
    setTimeout(() => {
      router.push(`/recipe/${videoId}`)
    }, 2000)
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-50">
    <div class="max-w-3xl mx-auto px-4 py-8">
      <!-- Header -->
      <div class="mb-8">
        <UButton to="/" variant="ghost" icon="i-ph-arrow-left" class="mb-4">
          Back to Library
        </UButton>
        <h1 class="text-2xl font-bold">Upload a Video</h1>
        <p class="text-muted mt-1">Upload a short-form video and get a step-by-step recreation guide</p>
      </div>

      <!-- Processing State -->
      <div v-if="processing" class="text-center py-20">
        <UIcon name="i-ph-circle-notch" class="w-12 h-12 animate-spin text-primary mx-auto" />
        <p class="mt-4 text-lg font-medium">{{ processingStatus }}</p>
        <p class="mt-2 text-muted">This may take a minute — we're analyzing the video with AI.</p>
      </div>

      <!-- Error -->
      <UAlert v-if="error" color="error" :title="error" class="mb-4" />

      <!-- Upload Form -->
      <div v-if="!processing" class="bg-white rounded-xl border border-neutral-200 p-6">
        <VideoUploadForm @success="handleSuccess" />
      </div>
    </div>
  </div>
</template>
