<script setup lang="ts">
import type { Segment, VideoWithSegments, VideoUpdate, SegmentInsert, Video, SkeletalLogicAnalysis, VideoAudioAnalysis } from '~/types'

const route = useRoute()
const router = useRouter()
const videoId = route.params.id as string

const { fetchVideo, updateVideo, getVideoUrl } = useVideos()
const { upsertSegments } = useSegments()
const { logicFlows, fetchLogicFlows } = useLogicFlows()

// Library composable for sidebar
const { videos: libraryVideos, loadLibrary, refreshVideos } = useLibrary()

const video = ref<VideoWithSegments | null>(null)
const semanticTags = ref<string[]>([])
const segments = ref<Segment[]>([])
const loading = ref(true)
const saving = ref(false)
const transcribing = ref(false)
const generatingAll = ref(false)
const reprocessing = ref(false)
const analyzingAudio = ref(false)
const analyzingSkeletalLogic = ref(false)
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

  video.value = data as VideoWithSegments
  segments.value = data.segments || []
  semanticTags.value = data.semantic_tags || []
  loading.value = false
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
    const videoUpdates: VideoUpdate & { semantic_tags?: string[] } = {
      creator_handle: video.value.creator_handle,
      platform: video.value.platform,
      source_url: video.value.source_url,
      logic_flow_id: video.value.logic_flow_id,
      status: video.value.status,
      semantic_tags: semanticTags.value
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

async function handleReprocess() {
  if (!video.value) return

  reprocessing.value = true
  error.value = null

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
      // Reload the video to get updated data
      await loadVideo()
      successMessage.value = `Re-processed: ${result.logicFlowName || 'Uncategorized'} with ${result.segmentCount} segments`
      setTimeout(() => (successMessage.value = null), 3000)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Re-processing failed'
  } finally {
    reprocessing.value = false
  }
}

async function handleAnalyzeAudio() {
  if (!video.value) return

  analyzingAudio.value = true
  error.value = null

  try {
    const result = await $fetch<{
      success: boolean
      audioAnalysis: VideoAudioAnalysis
    }>('/api/analyze-audio', {
      method: 'POST',
      body: { videoId }
    })

    if (result.success && video.value) {
      ;(video.value as unknown as { audio_analysis?: VideoAudioAnalysis | null }).audio_analysis = result.audioAnalysis
      successMessage.value = 'Audio analysis complete!'
      setTimeout(() => (successMessage.value = null), 3000)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Audio analysis failed'
  } finally {
    analyzingAudio.value = false
  }
}

function buildFullTranscriptFromSegments(segs: Segment[]): string {
  return segs
    .map((s) => (s.transcript_raw || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

async function handleGenerateSkeletalLogic() {
  if (!video.value) return

  const transcript = buildFullTranscriptFromSegments(segments.value)
  if (!transcript) {
    error.value = 'Transcribe the video first to generate skeletal logic'
    return
  }

  analyzingSkeletalLogic.value = true
  error.value = null

  try {
    const result = await $fetch<SkeletalLogicAnalysis>('/api/generate-skeletal-logic', {
      method: 'POST',
      body: {
        transcript,
        segments: segments.value.map((s) => ({
          label: s.label,
          start_time: s.start_time,
          end_time: s.end_time,
          transcript_raw: s.transcript_raw || ''
        })),
        logicFlowType: currentLogicFlowName.value || undefined
      }
    })

    const { error: updateErr } = await updateVideo(videoId, {
      skeletal_logic: result as unknown as VideoUpdate['skeletal_logic']
    } as VideoUpdate)
    if (updateErr) throw updateErr

    video.value.skeletal_logic = result as unknown as VideoUpdate['skeletal_logic']
    successMessage.value = 'Skeletal logic analysis complete!'
    setTimeout(() => (successMessage.value = null), 3000)
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Failed to generate skeletal logic'
  } finally {
    analyzingSkeletalLogic.value = false
  }
}

// Get the current logic flow name
const currentLogicFlowName = computed(() => {
  if (!video.value?.logic_flow_id) return null
  const flow = logicFlows.value.find(lf => lf.id === video.value?.logic_flow_id)
  return flow?.name || null
})

const logicFlowShortName = computed(() => {
  if (!currentLogicFlowName.value) return null
  const match = currentLogicFlowName.value.match(/^([^(]+)/)
  const base = match?.[1]
  return base ? base.trim() : currentLogicFlowName.value
})

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

watch(
  semanticTags,
  () => {
    if (!loading.value && video.value) scheduleAutoSave()
  },
  { deep: true }
)

// Compute full transcript for tag suggestions
const fullTranscript = computed(() => {
  return segments.value
    .map(s => s.transcript_raw)
    .filter(Boolean)
    .join(' ')
})

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
        <UBadge
          v-if="logicFlowShortName"
          color="primary"
          variant="solid"
          size="xs"
        >
          {{ logicFlowShortName }}
        </UBadge>
        <UBadge
          v-else-if="video && !video.logic_flow_id"
          color="neutral"
          variant="subtle"
          size="xs"
        >
          Uncategorized
        </UBadge>

        <!-- Semantic Tags (inline display) -->
        <template v-if="semanticTags.length > 0">
          <span class="text-dimmed">|</span>
          <UBadge
            v-for="tag in semanticTags.slice(0, 3)"
            :key="tag"
            color="neutral"
            variant="outline"
            size="xs"
          >
            {{ tag }}
          </UBadge>
          <span
            v-if="semanticTags.length > 3"
            class="text-xs text-muted"
          >
            +{{ semanticTags.length - 3 }} more
          </span>
        </template>
      </div>

      <div class="flex items-center gap-3">
        <!-- Alerts (inline) -->
        <span v-if="error" class="text-xs text-error">{{ error }}</span>
        <span v-if="successMessage" class="text-xs text-success">{{
          successMessage
        }}</span>

        <UButton
          :loading="reprocessing"
          variant="ghost"
          icon="i-ph-arrows-clockwise"
          size="sm"
          @click="handleReprocess"
        >
          Re-process
        </UButton>
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

      <!-- Middle Panel: Editor with Toggle Panels -->
      <main class="flex-1 flex flex-col bg-default rounded-lg shadow-sm overflow-hidden">
        <EditorPanels
          :segments="segments"
          :skeletal-logic="(video.skeletal_logic as unknown as SkeletalLogicAnalysis) || null"
          :skeletal-logic-generating="analyzingSkeletalLogic"
          :saving="saving"
          :save-status="saveStatus"
          @update:segments="(s: Segment[]) => (segments = s)"
          @generate-skeletal-logic="handleGenerateSkeletalLogic"
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

        <div class="flex-1 min-h-0 overflow-y-auto">
          <VideoPreviewPanel
            :video-src="videoUrl"
            :segments="segments"
            @update:segments="(s: Segment[]) => (segments = s)"
            @update:current-time="handleTimeUpdate"
            @update:duration="handleDurationChange"
          />

          <!-- Semantic Tags Section -->
          <div class="p-3 border-t border-muted">
            <EditorSemanticTags
              v-model="semanticTags"
              :transcript="fullTranscript"
            />
          </div>

          <!-- Audio Analysis Section -->
          <div class="p-3 border-t border-muted">
            <EditorAudioMetadata
              :audio-analysis="(video as unknown as { audio_analysis?: VideoAudioAnalysis | null })?.audio_analysis || null"
              :analyzing="analyzingAudio"
              @analyze="handleAnalyzeAudio"
            />
          </div>
        </div>
      </aside>

    </div>
  </div>
</template>
