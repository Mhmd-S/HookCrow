<script setup lang="ts">
type ItemStatus = 'queued' | 'uploading' | 'processing' | 'complete' | 'error'

interface BulkItem {
  id: string
  file: File
  sourceUrl: string
  status: ItemStatus
  videoId?: string
  error?: string
  logicFlowName?: string | null
  segmentCount?: number
}

const CONCURRENCY = 3

const { createVideo, uploadVideoFile } = useVideos()
const { authHeaders } = useAuth()

const items = ref<BulkItem[]>([])
const selectError = ref<string | null>(null)
const running = ref(false)

const counts = computed(() => {
  const c = { queued: 0, uploading: 0, processing: 0, complete: 0, error: 0 }
  for (const it of items.value) c[it.status]++
  return c
})

const hasInFlight = computed(() =>
  items.value.some(i => i.status === 'uploading' || i.status === 'processing')
)
const hasQueued = computed(() => items.value.some(i => i.status === 'queued'))
const hasCompleted = computed(() => items.value.some(i => i.status === 'complete'))

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function statusColor(status: ItemStatus): 'neutral' | 'primary' | 'warning' | 'success' | 'error' {
  switch (status) {
    case 'queued': return 'neutral'
    case 'uploading': return 'primary'
    case 'processing': return 'warning'
    case 'complete': return 'success'
    case 'error': return 'error'
  }
}

function statusLabel(status: ItemStatus): string {
  switch (status) {
    case 'queued': return 'Queued'
    case 'uploading': return 'Uploading'
    case 'processing': return 'Processing'
    case 'complete': return 'Complete'
    case 'error': return 'Error'
  }
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return

  selectError.value = null
  const rejected: string[] = []

  for (const file of Array.from(files)) {
    if (!file.type.startsWith('video/')) {
      rejected.push(file.name)
      continue
    }
    items.value.push({
      id: crypto.randomUUID(),
      file,
      sourceUrl: '',
      status: 'queued'
    })
  }

  if (rejected.length > 0) {
    selectError.value = `Skipped non-video files: ${rejected.join(', ')}`
  }

  target.value = ''
}

function removeItem(id: string) {
  const idx = items.value.findIndex(i => i.id === id)
  if (idx === -1) return
  const it = items.value[idx]
  if (it && (it.status === 'uploading' || it.status === 'processing')) return
  items.value.splice(idx, 1)
}

function clearCompleted() {
  items.value = items.value.filter(i => i.status !== 'complete')
}

async function processItem(item: BulkItem) {
  const { path, error: uploadErr } = await uploadVideoFile(item.file)
  if (uploadErr || !path) {
    item.status = 'error'
    item.error = uploadErr?.message ?? 'Failed to upload video'
    return
  }

  const { data, error: createErr } = await createVideo({
    video_path: path,
    source_url: item.sourceUrl.trim() || null
  })
  if (createErr || !data) {
    item.status = 'error'
    item.error = createErr?.message ?? 'Failed to create video record'
    return
  }
  item.videoId = data.id
  item.status = 'processing'

  try {
    const result = await $fetch<{
      success: boolean
      logicFlowId: string | null
      logicFlowName: string | null
      segmentCount: number
    }>('/api/admin/process-video', {
      method: 'POST',
      body: { videoId: data.id },
      headers: authHeaders()
    })

    if (result.success) {
      item.status = 'complete'
      item.logicFlowName = result.logicFlowName
      item.segmentCount = result.segmentCount
    } else {
      item.status = 'error'
      item.error = 'Processing returned non-success'
    }
  } catch (err) {
    item.status = 'error'
    item.error = err instanceof Error ? err.message : 'Processing failed'
  }
}

async function startAll() {
  if (running.value) return
  running.value = true

  try {
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const next = items.value.find(i => i.status === 'queued')
        if (!next) return
        next.status = 'uploading'
        await processItem(next)
      }
    })
    await Promise.all(workers)
  } finally {
    running.value = false
  }
}

function beforeUnloadHandler(event: BeforeUnloadEvent) {
  if (hasInFlight.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', beforeUnloadHandler)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnloadHandler)
})
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="selectError" color="warning" :title="selectError" />

    <UAlert
      v-if="hasInFlight"
      color="info"
      icon="i-ph-warning-circle"
      title="Keep this tab open"
      description="Processing runs in your browser. Leaving this page will abort in-flight uploads."
    />

    <!-- File picker -->
    <div class="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <UIcon name="i-ph-stack" class="w-8 h-8 text-neutral-400" />
          <div>
            <p class="font-medium">Select multiple videos</p>
            <p class="text-sm text-muted">They'll be queued and processed in parallel (up to {{ CONCURRENCY }} at a time).</p>
          </div>
        </div>
        <label class="cursor-pointer">
          <input
            type="file"
            accept="video/*"
            multiple
            class="sr-only"
            :disabled="running"
            @change="handleFileSelect"
          />
          <span class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100" :class="{ 'opacity-50 cursor-not-allowed': running }">
            <UIcon name="i-ph-plus" class="w-4 h-4" />
            Add Videos
          </span>
        </label>
      </div>
    </div>

    <!-- Summary bar -->
    <div v-if="items.length > 0" class="flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-2 text-sm">
        <UBadge v-if="counts.queued > 0" color="neutral" variant="subtle">{{ counts.queued }} queued</UBadge>
        <UBadge v-if="counts.uploading > 0" color="primary" variant="subtle">{{ counts.uploading }} uploading</UBadge>
        <UBadge v-if="counts.processing > 0" color="warning" variant="subtle">{{ counts.processing }} processing</UBadge>
        <UBadge v-if="counts.complete > 0" color="success" variant="subtle">{{ counts.complete }} complete</UBadge>
        <UBadge v-if="counts.error > 0" color="error" variant="subtle">{{ counts.error }} error</UBadge>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="hasCompleted"
          variant="ghost"
          size="sm"
          icon="i-ph-eraser"
          :disabled="running"
          @click="clearCompleted"
        >
          Clear Completed
        </UButton>
        <UButton
          color="primary"
          size="sm"
          icon="i-ph-play"
          :loading="running"
          :disabled="!hasQueued || running"
          @click="startAll"
        >
          Start All
        </UButton>
      </div>
    </div>

    <!-- Items list -->
    <div v-if="items.length > 0" class="space-y-2">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex items-start gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
      >
        <UIcon name="i-ph-file-video" class="w-5 h-5 mt-1 text-neutral-400 shrink-0" />

        <div class="flex-1 min-w-0 space-y-2">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm font-medium truncate">{{ item.file.name }}</p>
            <span class="text-xs text-muted shrink-0">{{ formatBytes(item.file.size) }}</span>
            <UBadge :color="statusColor(item.status)" variant="subtle" size="xs">
              <UIcon
                v-if="item.status === 'uploading' || item.status === 'processing'"
                name="i-ph-circle-notch"
                class="w-3 h-3 animate-spin mr-1"
              />
              {{ statusLabel(item.status) }}
            </UBadge>
          </div>

          <UInput
            v-model="item.sourceUrl"
            type="url"
            size="sm"
            placeholder="Original URL (optional, e.g. https://tiktok.com/...)"
            :disabled="item.status !== 'queued'"
            class="w-full"
          />

          <p v-if="item.error" class="text-xs text-error">{{ item.error }}</p>
          <p v-else-if="item.status === 'complete'" class="text-xs text-success">
            {{ item.logicFlowName ? `Matched: ${item.logicFlowName}` : 'Processed' }}{{ item.segmentCount ? ` · ${item.segmentCount} segments` : '' }}
          </p>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <UButton
            v-if="item.status === 'complete' && item.videoId"
            :to="`/admin/recipes/${item.videoId}`"
            size="xs"
            variant="soft"
            icon="i-ph-pencil"
          >
            Open
          </UButton>
          <UButton
            v-if="item.status === 'queued' || item.status === 'complete' || item.status === 'error'"
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-ph-x"
            :disabled="running && item.status === 'queued'"
            @click="removeItem(item.id)"
          />
        </div>
      </div>
    </div>

    <div v-else class="text-center py-12 text-muted text-sm">
      No videos added yet. Click "Add Videos" to get started.
    </div>
  </div>
</template>
