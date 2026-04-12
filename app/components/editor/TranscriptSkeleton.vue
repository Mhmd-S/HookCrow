<script setup lang="ts">
import type { Segment } from '~/types'

const { authHeaders } = useAuth()

interface Props {
  segments: Segment[]
  saving?: boolean
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error'
}

const props = withDefaults(defineProps<Props>(), {
  saving: false,
  saveStatus: 'saved'
})

const emit = defineEmits<{
  'update:segments': [segments: Segment[]]
  save: []
}>()

const generating = ref(false)
const generatingIndex = ref<number | null>(null)
const error = ref<string | null>(null)

// Track which view mode each segment is in: 'raw' or 'template'
const segmentViewMode = ref<Map<string, 'raw' | 'template'>>(new Map())

// Get or initialize view mode for a segment
function getViewMode(segmentId: string): 'raw' | 'template' {
  return segmentViewMode.value.get(segmentId) || 'raw'
}

function toggleViewMode(segmentId: string) {
  const current = getViewMode(segmentId)
  segmentViewMode.value.set(segmentId, current === 'raw' ? 'template' : 'raw')
}

// Local copy of segment transcripts for editing
const localTranscripts = ref<Map<string, string>>(new Map())

// Initialize local transcripts from segments
watch(
  () => props.segments,
  (segs) => {
    segs.forEach((seg) => {
      if (seg.id && !localTranscripts.value.has(seg.id)) {
        localTranscripts.value.set(seg.id, seg.transcript_raw || '')
      }
    })
  },
  { immediate: true, deep: true }
)

// Status indicator
const statusIcon = computed(() => {
  switch (props.saveStatus) {
    case 'saving':
      return 'i-ph-spinner'
    case 'saved':
      return 'i-ph-check-circle'
    case 'error':
      return 'i-ph-x-circle'
    case 'unsaved':
      return 'i-ph-circle'
    default:
      return 'i-ph-circle'
  }
})

const statusColor = computed(() => {
  switch (props.saveStatus) {
    case 'saving':
      return 'text-muted'
    case 'saved':
      return 'text-green-500'
    case 'error':
      return 'text-red-500'
    case 'unsaved':
      return 'text-yellow-500'
    default:
      return 'text-muted'
  }
})

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
}

function getSegmentColor(label: string): string {
  const colors: Record<string, string> = {
    Hook: 'bg-red-500/10 border-red-500/30',
    Bridge: 'bg-yellow-500/10 border-yellow-500/30',
    Value: 'bg-green-500/10 border-green-500/30',
    Proof: 'bg-blue-500/10 border-blue-500/30',
    CTA: 'bg-purple-500/10 border-purple-500/30'
  }
  return colors[label] || 'bg-muted border-default'
}

function getLabelColor(label: string): string {
  const colors: Record<string, string> = {
    Hook: 'text-red-500',
    Bridge: 'text-yellow-500',
    Value: 'text-green-500',
    Proof: 'text-blue-500',
    CTA: 'text-purple-500'
  }
  return colors[label] || 'text-muted'
}

function handleTranscriptEdit(segmentId: string, value: string) {
  localTranscripts.value.set(segmentId, value)

  // Update segment
  const updated = props.segments.map((seg) => {
    if (seg.id === segmentId) {
      return { ...seg, transcript_raw: value }
    }
    return seg
  })
  emit('update:segments', updated)
}

async function generateTemplate(index: number) {
  const segment = props.segments[index]
  if (!segment || !segment.transcript_raw) {
    error.value = 'No transcript available for this segment'
    return
  }

  generating.value = true
  generatingIndex.value = index
  error.value = null

  try {
    const { template } = await $fetch<{ template: string }>(
      '/api/admin/generate-transcript-template',
      {
        method: 'POST',
        body: {
          transcript: segment.transcript_raw,
          videoContext: `Segment type: ${segment.label}`
        },
        headers: authHeaders()
      }
    )

    // Update the segment's script_blueprint with the generated template
    const updated = props.segments.map((seg, i) => {
      if (i === index) {
        return { ...seg, script_blueprint: template }
      }
      return seg
    })
    emit('update:segments', updated)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to generate template'
  } finally {
    generating.value = false
    generatingIndex.value = null
  }
}

async function generateAllTemplates() {
  generating.value = true
  error.value = null

  try {
    for (let i = 0; i < props.segments.length; i++) {
      const seg = props.segments[i]
      if (seg && seg.transcript_raw && !seg.script_blueprint) {
        generatingIndex.value = i
        await generateTemplate(i)
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to generate templates'
  } finally {
    generating.value = false
    generatingIndex.value = null
  }
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault()
    emit('save')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between p-3 border-b border-muted">
      <!-- Status Indicator -->
      <div class="flex items-center gap-1">
        <UIcon
          :name="statusIcon"
          class="w-4 h-4"
          :class="[statusColor, { 'animate-spin': saveStatus === 'saving' }]"
        />
        <span class="text-xs" :class="statusColor">
          {{ saveStatus === 'saving' ? 'Saving...' : saveStatus }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          v-if="segments.some((s) => s.transcript_raw && !s.script_blueprint)"
          :loading="generating"
          variant="soft"
          color="primary"
          size="sm"
          icon="i-ph-magic-wand"
          @click="generateAllTemplates"
        >
          Generate All
        </UButton>

        <UButton size="sm" variant="ghost" icon="i-ph-floppy-disk" @click="emit('save')">
          Save
        </UButton>
      </div>
    </div>

    <!-- Error Alert -->
    <div v-if="error" class="px-3 pt-3">
      <UAlert color="error" :title="error" :close="true" @close="error = null" />
    </div>

    <!-- Segments List -->
    <div class="flex-1 overflow-y-auto p-3 space-y-4">
      <div v-if="segments.length === 0" class="text-center py-8 text-muted">
        <UIcon name="i-ph-text-align-left" class="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p class="text-sm">No segments yet</p>
        <p class="text-xs text-dimmed mt-1">Add segments using the timeline to get started</p>
      </div>

      <div
        v-for="(segment, index) in segments"
        :key="segment.id || index"
        class="rounded-lg border p-3 space-y-3"
        :class="getSegmentColor(segment.label)"
      >
        <!-- Segment Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium" :class="getLabelColor(segment.label)">
              {{ segment.label }}
            </span>
            <span class="text-xs text-dimmed">
              {{ formatTime(segment.start_time) }} - {{ formatTime(segment.end_time) }}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <!-- View Mode Toggle -->
            <div v-if="segment.script_blueprint && segment.id" class="flex items-center">
              <button
                class="px-2 py-0.5 text-xs rounded-l border transition-colors"
                :class="
                  getViewMode(segment.id) === 'raw'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-default text-muted border-muted hover:bg-muted'
                "
                @click="segmentViewMode.set(segment.id, 'raw')"
              >
                Raw
              </button>
              <button
                class="px-2 py-0.5 text-xs rounded-r border-t border-r border-b transition-colors"
                :class="
                  getViewMode(segment.id) === 'template'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-default text-muted border-muted hover:bg-muted'
                "
                @click="segmentViewMode.set(segment.id, 'template')"
              >
                Template
              </button>
            </div>

            <UButton
              v-if="segment.transcript_raw"
              :loading="generating && generatingIndex === index"
              variant="ghost"
              size="xs"
              icon="i-ph-sparkle"
              @click="generateTemplate(index)"
            >
              {{ segment.script_blueprint ? 'Regenerate' : 'Generate' }}
            </UButton>
          </div>
        </div>

        <!-- Content Area - Toggle between Raw and Template -->
        <div>
          <!-- Raw Transcript View -->
          <div v-if="!segment.script_blueprint || (segment.id && getViewMode(segment.id) === 'raw')">
            <label class="text-xs font-medium text-muted mb-1 block">Raw Transcript</label>
            <textarea
              :value="segment.transcript_raw || ''"
              class="w-full px-2 py-1.5 text-xs font-mono bg-default border border-muted rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows="3"
              placeholder="Transcribed text will appear here..."
              @input="
                (e) =>
                  segment.id &&
                  handleTranscriptEdit(segment.id, (e.target as HTMLTextAreaElement).value)
              "
            />
          </div>

          <!-- Template View -->
          <div v-else-if="segment.script_blueprint && segment.id && getViewMode(segment.id) === 'template'">
            <label class="text-xs font-medium text-muted mb-1 block">Template Skeleton</label>
            <div
              class="px-2 py-1.5 text-xs font-mono bg-muted rounded whitespace-pre-wrap text-default min-h-[4.5rem]"
            >
              {{ segment.script_blueprint }}
            </div>
          </div>
        </div>

        <!-- Generating Indicator -->
        <div
          v-if="generating && generatingIndex === index && !segment.script_blueprint"
          class="flex items-center gap-2 text-xs text-muted"
        >
          <UIcon name="i-ph-spinner" class="w-4 h-4 animate-spin" />
          <span>Generating template...</span>
        </div>
      </div>
    </div>

    <!-- Help Text -->
    <div class="px-3 py-2 border-t border-muted">
      <p class="text-xs text-dimmed">
        Transcribe video first, then generate templates with [PLACEHOLDER] markers
      </p>
    </div>
  </div>
</template>
