<script setup lang="ts">
const emit = defineEmits<{
  success: [videoId: string]
}>()

const { createVideo, uploadVideoFile } = useVideos()

const loading = ref(false)
const error = ref<string | null>(null)
const videoFile = ref<File | null>(null)
const videoPreviewUrl = ref<string | null>(null)

// Processing state
type ProcessingStep = 'idle' | 'uploading' | 'transcribing' | 'analyzing' | 'complete'
const processingStep = ref<ProcessingStep>('idle')
const processingError = ref<string | null>(null)

const form = reactive({
  source_url: ''
})

const processingSteps = [
  { key: 'uploading', label: 'Uploading video...' },
  { key: 'transcribing', label: 'Transcribing audio...' },
  { key: 'analyzing', label: 'Analyzing structure...' },
  { key: 'complete', label: 'Complete!' }
] as const

const currentStepIndex = computed(() => {
  const index = processingSteps.findIndex(s => s.key === processingStep.value)
  return index >= 0 ? index : -1
})

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return
  const file = files[0]
  if (!file) return

  if (!file.type.startsWith('video/')) {
    error.value = 'Please select a video file'
    return
  }

  videoFile.value = file
  videoPreviewUrl.value = URL.createObjectURL(file)
  error.value = null
  processingError.value = null
}

async function handleSubmit() {
  if (!videoFile.value) {
    error.value = 'Please select a video file'
    return
  }

  loading.value = true
  error.value = null
  processingError.value = null
  processingStep.value = 'uploading'

  let videoId: string | null = null

  try {
    // Step 1: Upload video file
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

    videoId = data.id

    // Step 2: Start transcription and analysis
    processingStep.value = 'transcribing'

    try {
      const result = await $fetch<{
        success: boolean
        logicFlowId: string | null
        logicFlowName: string | null
        segmentCount: number
      }>('/api/process-video', {
        method: 'POST',
        body: { videoId }
      })

      if (result.success) {
        processingStep.value = 'complete'
        // Small delay to show the complete state
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (processErr) {
      // Processing failed but video was created - still navigate to edit page
      console.error('Processing error:', processErr)
      processingError.value = processErr instanceof Error ? processErr.message : 'Processing failed - you can retry from the edit page'
    }

    emit('success', videoId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An error occurred'
    processingStep.value = 'idle'
  } finally {
    loading.value = false
  }
}

</script>

<template>
  <UForm :state="form" @submit="handleSubmit" class="space-y-6">
    <UAlert v-if="error" color="error" :title="error" />
    <UAlert v-if="processingError" color="warning" :title="processingError" />

    <!-- Processing Progress -->
    <div v-if="loading && processingStep !== 'idle'" class="bg-muted rounded-lg p-4 space-y-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <UIcon name="i-ph-circle-notch" class="w-4 h-4 animate-spin text-primary" />
        <span>Processing video...</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="(step, index) in processingSteps"
          :key="step.key"
          class="flex items-center gap-2 text-sm"
          :class="{
            'text-muted': index > currentStepIndex,
            'text-primary font-medium': index === currentStepIndex,
            'text-success': index < currentStepIndex || (processingStep === 'complete' && index === currentStepIndex)
          }"
        >
          <UIcon
            :name="index < currentStepIndex || (processingStep === 'complete' && index === currentStepIndex)
              ? 'i-ph-check-circle'
              : index === currentStepIndex
                ? 'i-ph-circle-notch'
                : 'i-ph-circle'"
            class="w-4 h-4"
            :class="{ 'animate-spin': index === currentStepIndex && processingStep !== 'complete' }"
          />
          <span>{{ step.label }}</span>
        </div>
      </div>
    </div>

    <!-- Video Upload -->
    <UFormField v-if="!loading" label="Video File" required>
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
    <UFormField v-if="!loading" label="Original URL">
      <UInput v-model="form.source_url" type="url" placeholder="https://tiktok.com/..." />
    </UFormField>

    <div v-if="!loading" class="flex justify-end gap-3">
      <UButton type="submit" :loading="loading" :disabled="!videoFile">
        Upload & Auto-Analyze
      </UButton>
    </div>
  </UForm>
</template>
