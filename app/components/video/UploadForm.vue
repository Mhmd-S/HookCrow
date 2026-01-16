<script setup lang="ts">
const emit = defineEmits<{
  success: [videoId: string]
}>()

const { createVideo, uploadVideoFile } = useVideos()

const loading = ref(false)
const error = ref<string | null>(null)
const videoFile = ref<File | null>(null)
const videoPreviewUrl = ref<string | null>(null)

const form = reactive({
  source_url: ''
})

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return
  const file = files[0]

  if (!file.type.startsWith('video/')) {
    error.value = 'Please select a video file'
    return
  }

  videoFile.value = file
  videoPreviewUrl.value = URL.createObjectURL(file)
}

async function handleSubmit() {
  if (!videoFile.value) {
    error.value = 'Please select a video file'
    return
  }

  loading.value = true
  error.value = null

  try {
    // Upload video file
    const { path, error: uploadError } = await uploadVideoFile(videoFile.value)
    if (uploadError || !path) {
      throw new Error(uploadError?.message || 'Failed to upload video')
    }

    // Create video record
    const { data, error: createError } = await createVideo({
      video_path: path,
      source_url: form.source_url || null
    })

    if (createError || !data) {
      throw new Error(createError?.message || 'Failed to create video record')
    }

    emit('success', data.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An error occurred'
  } finally {
    loading.value = false
  }
}

</script>

<template>
  <UForm :state="form" @submit="handleSubmit" class="space-y-6">
    <UAlert v-if="error" color="error" :title="error" />

    <!-- Video Upload -->
    <UFormField label="Video File" required>
      <div class="space-y-4">
        <input
          type="file"
          accept="video/*"
          class="block w-full text-sm text-neutral-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-medium
            file:bg-neutral-100 file:text-neutral-700
            hover:file:bg-neutral-200
            dark:file:bg-neutral-800 dark:file:text-neutral-300
            dark:hover:file:bg-neutral-700"
          @change="handleFileSelect"
        />
        <div v-if="videoPreviewUrl" class="relative aspect-9/16 max-w-xs bg-black rounded-lg overflow-hidden">
          <video
            :src="videoPreviewUrl"
            controls
            class="w-full h-full object-contain"
          />
        </div>
      </div>
    </UFormField>

    <!-- Source URL -->
    <UFormField label="Original URL">
      <UInput v-model="form.source_url" type="url" placeholder="https://tiktok.com/..." />
    </UFormField>

    <div class="flex justify-end gap-3">
      <UButton type="submit" :loading="loading">
        Upload & Continue to Anatomize
      </UButton>
    </div>
  </UForm>
</template>
