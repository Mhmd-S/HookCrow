<script setup lang="ts">
import type { Segment, VideoWithSegments, VideoUpdate, SegmentInsert, LogicFlow, Video } from '~/types'

const route = useRoute()
const router = useRouter()
const videoId = route.params.id as string

const { fetchVideo, updateVideo, getVideoUrl } = useVideos()
const { upsertSegments } = useSegments()
const { logicFlows, fetchLogicFlows } = useLogicFlows()

// Library composable for sidebar
const { videos: libraryVideos, loadLibrary, refreshVideos } = useLibrary()

const video = ref<VideoWithSegments | null>(null)
const segments = ref<Segment[]>([])
const loading = ref(true)
const saving = ref(false)
const transcribing = ref(false)
const generatingAll = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)

// Auto-save state
const saveStatus = ref<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
const lastSavedAt = ref<Date | null>(null)
const hasUnsavedChanges = ref(false)
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

// Video player state
const currentTime = ref(0)
const duration = ref(0)
const activeSegmentIndex = ref<number | null>(null)

// Markdown sync
const { markdown, parseErrors, initFromSegments, applyTemplate } = useMarkdownSync(
  segments,
  { videoId, debounceMs: 300 }
)

// Library panel state
const showLibrary = ref(true)

async function loadVideo() {
  loading.value = true
  error.value = null

  await Promise.all([fetchLogicFlows(), loadLibrary()])

  const { data, error: err } = await fetchVideo(videoId)
  if (err || !data) {
    error.value = err?.message || 'Video not found'
    loading.value = false
    return
  }

  video.value = data
  segments.value = data.segments || []
  loading.value = false

  // Initialize markdown from segments after a tick
  nextTick(() => {
    initFromSegments()
  })
}

// Debounced auto-save
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  hasUnsavedChanges.value = true
  saveStatus.value = 'unsaved'

  autoSaveTimer = setTimeout(() => {
    handleSave(true)
  }, 2000)
}

async function handleSave(isAutoSave = false) {
  if (!video.value) return

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  saving.value = true
  saveStatus.value = 'saving'
  error.value = null
  if (!isAutoSave) successMessage.value = null

  try {
    const videoUpdates: VideoUpdate = {
      creator_handle: video.value.creator_handle,
      platform: video.value.platform,
      source_url: video.value.source_url,
      logic_flow_id: video.value.logic_flow_id,
      status: video.value.status
    }

    const { error: updateErr } = await updateVideo(videoId, videoUpdates)
    if (updateErr) throw updateErr

    const segmentInserts: SegmentInsert[] = segments.value.map((s, i) => ({
      video_id: videoId,
      segment_order: i,
      label: s.label,
      start_time: s.start_time,
      end_time: s.end_time,
      transcript_raw: s.transcript_raw,
      script_blueprint: s.script_blueprint,
      visual_notes: s.visual_notes,
      tags: s.tags
    }))

    const { error: segmentErr } = await upsertSegments(videoId, segmentInserts)
    if (segmentErr) throw segmentErr

    saveStatus.value = 'saved'
    lastSavedAt.value = new Date()
    hasUnsavedChanges.value = false

    // Refresh library to show updated video
    refreshVideos()

    if (!isAutoSave) {
      successMessage.value = 'Saved!'
      setTimeout(() => (successMessage.value = null), 2000)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save'
    saveStatus.value = 'error'
  } finally {
    saving.value = false
  }
}

async function handleTranscribe() {
  if (!video.value || segments.value.length === 0) {
    error.value = 'Add segments first using the timeline'
    return
  }

  transcribing.value = true
  error.value = null

  try {
    const videoUrl = getVideoUrl(video.value.video_path)
    const response = await fetch(videoUrl)
    const blob = await response.blob()

    const formData = new FormData()
    formData.append('file', blob, 'video.mp4')

    const result = await $fetch<{
      text: string
      segments: Array<{ start: number; end: number; text: string }>
    }>('/api/transcribe', {
      method: 'POST',
      body: formData
    })

    if (result.segments.length > 0) {
      segments.value = segments.value.map((seg) => {
        const matchingTranscriptions = result.segments.filter(
          (t) => t.start >= seg.start_time && t.end <= seg.end_time
        )
        if (matchingTranscriptions.length > 0) {
          return {
            ...seg,
            transcript_raw: matchingTranscriptions
              .map((t) => t.text)
              .join(' ')
              .trim()
          }
        }
        return seg
      })
    }

    successMessage.value = 'Transcription complete!'
    setTimeout(() => (successMessage.value = null), 2000)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Transcription failed'
  } finally {
    transcribing.value = false
  }
}

async function generateBlueprint(index: number) {
  const segment = segments.value[index]
  if (!segment || !segment.transcript_raw) {
    error.value = 'Transcribe this segment first'
    return
  }

  try {
    const { blueprint } = await $fetch<{ blueprint: string }>(
      '/api/generate-blueprint',
      {
        method: 'POST',
        body: {
          transcript: segment.transcript_raw,
          segmentLabel: segment.label
        }
      }
    )

    segments.value = segments.value.map((s, i) =>
      i === index ? { ...s, script_blueprint: blueprint } : s
    )
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Failed to generate blueprint'
  }
}

async function handleGenerateAll() {
  if (segments.value.length === 0) {
    error.value = 'Add segments first'
    return
  }

  generatingAll.value = true
  error.value = null

  try {
    const needsTranscription = segments.value.some((s) => !s.transcript_raw)
    if (needsTranscription) {
      await handleTranscribe()
    }

    for (let i = 0; i < segments.value.length; i++) {
      const seg = segments.value[i]
      if (seg && seg.transcript_raw && !seg.script_blueprint) {
        await generateBlueprint(i)
      }
    }

    successMessage.value = 'All segments processed!'
    setTimeout(() => (successMessage.value = null), 2000)
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Failed to process segments'
  } finally {
    generatingAll.value = false
  }
}

function handleTimeUpdate(time: number) {
  currentTime.value = time
  const index = segments.value.findIndex(
    (s) => time >= s.start_time && time < s.end_time
  )
  activeSegmentIndex.value = index >= 0 ? index : null
}

function handleDurationChange(d: number) {
  duration.value = d
}

function toggleStatus() {
  if (!video.value) return
  video.value.status = video.value.status === 'draft' ? 'complete' : 'draft'
  scheduleAutoSave()
}

// Handle library video selection
function handleSelectVideo(selectedVideo: Video) {
  if (selectedVideo.id !== videoId) {
    // Save current work before navigating
    if (hasUnsavedChanges.value) {
      handleSave(true)
    }
    router.push(`/anatomize/${selectedVideo.id}`)
  }
}

// Handle template application from editor
function handleEditorApplyTemplate(template: LogicFlow) {
  if (template.template_markdown) {
    applyTemplate(template.template_markdown, duration.value)
    if (video.value) {
      video.value.logic_flow_id = template.id
    }
    scheduleAutoSave()
  }
}

// Watch for changes to trigger auto-save
watch(
  segments,
  () => {
    if (!loading.value) scheduleAutoSave()
  },
  { deep: true }
)

watch(
  () => video.value?.logic_flow_id,
  () => {
    if (!loading.value && video.value) scheduleAutoSave()
  }
)

watch(
  () => video.value?.source_url,
  () => {
    if (!loading.value && video.value) scheduleAutoSave()
  }
)

onUnmounted(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
})

onBeforeUnmount(() => {
  if (hasUnsavedChanges.value && autoSaveTimer) {
    handleSave(true)
  }
})

onMounted(loadVideo)

const videoUrl = computed(() =>
  video.value ? getVideoUrl(video.value.video_path) : ''
)

const videoTitle = computed(() => video.value?.creator_handle || 'Untitled Video')
</script>

<template>
  <div class="h-screen flex flex-col">
    <!-- Top Header Bar -->
    <header
      class="shrink-0 h-12 flex items-center justify-between px-4 border-b border-default"
    >
      <div class="flex items-center gap-3">
        <UButton to="/" variant="ghost" icon="i-ph-arrow-left" size="sm" />
        <UButton
          variant="ghost"
          :icon="showLibrary ? 'i-ph-sidebar-simple' : 'i-ph-sidebar-simple'"
          size="sm"
          @click="showLibrary = !showLibrary"
        />
        <span class="text-sm font-medium text-default">
          {{ videoTitle }}
        </span>
        <UBadge
          v-if="video"
          :color="video.status === 'complete' ? 'success' : 'warning'"
          variant="subtle"
          size="xs"
          class="cursor-pointer"
          @click="toggleStatus"
        >
          {{ video.status === 'complete' ? 'Complete' : 'Draft' }}
        </UBadge>
      </div>

      <div class="flex items-center gap-3">
        <!-- Alerts (inline) -->
        <span v-if="error" class="text-xs text-error">{{ error }}</span>
        <span v-if="successMessage" class="text-xs text-success">{{
          successMessage
        }}</span>

        <UButton
          :to="`/view/${videoId}`"
          variant="ghost"
          icon="i-ph-eye"
          size="sm"
        >
          Preview
        </UButton>
        <UButton
          :loading="saving"
          icon="i-ph-floppy-disk"
          size="sm"
          @click="() => handleSave()"
        >
          Save
        </UButton>
      </div>
    </header>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="flex-1 flex items-center justify-center"
    >
      <UIcon
        name="i-ph-circle-notch"
        class="w-8 h-8 animate-spin text-muted"
      />
    </div>

    <!-- Error State -->
    <div
      v-else-if="error && !video"
      class="flex-1 flex items-center justify-center"
    >
      <div class="text-center max-w-md">
        <UAlert color="error" :title="error" />
        <UButton to="/" class="mt-4" variant="soft">Back to Dashboard</UButton>
      </div>
    </div>

    <!-- Main Three-Column Layout -->
    <div v-else-if="video" class="flex-1 flex gap-4 p-4 overflow-hidden">
      <!-- Left Panel: Library -->
      <aside
        v-if="showLibrary"
        class="w-72 shrink-0 rounded-lg shadow-sm overflow-hidden"
      >
        <LibraryPanel
          :videos="libraryVideos"
          :current-video-id="videoId"
          :loading="loading"
          @select-video="handleSelectVideo"
        />
      </aside>

      <!-- Middle Panel: Markdown Editor -->
      <main class="flex-1 flex flex-col bg-default rounded-lg shadow-sm overflow-hidden">
        <EditorMarkdown
          v-model="markdown"
          :errors="parseErrors"
          :logic-flows="logicFlows"
          :selected-logic-flow-id="video.logic_flow_id"
          :video-title="videoTitle"
          :saving="saving"
          :save-status="saveStatus"
          @update:selected-logic-flow-id="(id: string | null) => (video!.logic_flow_id = id)"
          @apply-template="handleEditorApplyTemplate"
          @save="() => handleSave()"
        />
      </main>

      <!-- Right Panel: Video Preview -->
      <aside
        class="w-80 shrink-0 bg-default rounded-lg shadow-sm overflow-hidden relative border-muted flex flex-col h-full"
      >
        <!-- AI Actions Floating Buttons -->
        <div
          class="absolute top-2 right-2 z-10 flex gap-1"
        >
          <UButton
            :loading="generatingAll"
            variant="solid"
            icon="i-ph-magic-wand"
            size="xs"
            :disabled="segments.length === 0"
            @click="handleGenerateAll"
          >
            {{ generatingAll ? 'Processing...' : 'Auto-Fill' }}
          </UButton>
          <UButton
            :loading="transcribing"
            variant="solid"
            icon="i-ph-microphone"
            size="xs"
            :disabled="segments.length === 0"
            @click="handleTranscribe"
          >
            Transcribe
          </UButton>
        </div>

        <div class="flex-1 min-h-0">
          <VideoPreviewPanel
            :video-src="videoUrl"
            :segments="segments"
            @update:segments="(s: Segment[]) => (segments = s)"
            @update:current-time="handleTimeUpdate"
            @update:duration="handleDurationChange"
          />
        </div>
      </aside>

    </div>
  </div>
</template>
