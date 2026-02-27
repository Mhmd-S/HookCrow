<script setup lang="ts">
definePageMeta({ layout: 'blank', middleware: ['admin'] })

const router = useRouter()

function handleSuccess(videoId: string) {
  router.push(`/admin/anatomize/${videoId}`)
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
        <p class="text-neutral-500 mt-1">Add a video to anatomize into a template</p>
      </div>

      <!-- Upload Form -->
      <div class="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
        <VideoUploadForm @success="handleSuccess" />
      </div>
    </div>
  </div>
</template>
