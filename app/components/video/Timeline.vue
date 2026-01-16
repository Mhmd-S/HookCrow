<script setup lang="ts">
import type { Segment } from '~/types'
import { SEGMENT_LABELS } from '~/types'

const props = defineProps<{
  duration: number
  currentTime: number
  modelValue: Segment[]
}>()

const emit = defineEmits<{
  'update:modelValue': [segments: Segment[]]
  seek: [time: number]
}>()

const showAddMenu = ref(false)
const addMenuPosition = ref({ x: 0, time: 0 })

function getSegmentColor(label: string): string {
  const colors: Record<string, string> = {
    Hook: 'bg-red-500',
    Bridge: 'bg-yellow-500',
    Value: 'bg-green-500',
    Proof: 'bg-blue-500',
    CTA: 'bg-purple-500'
  }
  return colors[label] || 'bg-neutral-500'
}

function getSegmentBorder(label: string): string {
  const colors: Record<string, string> = {
    Hook: 'border-red-600',
    Bridge: 'border-yellow-600',
    Value: 'border-green-600',
    Proof: 'border-blue-600',
    CTA: 'border-purple-600'
  }
  return colors[label] || 'border-neutral-600'
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function handleTimelineClick(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  const time = percent * props.duration
  emit('seek', time)
}

function handleTimelineRightClick(event: MouseEvent) {
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  const time = percent * props.duration

  addMenuPosition.value = { x: event.clientX - rect.left, time }
  showAddMenu.value = true
}

function addSegmentAtTime(label: string, time: number) {
  // Find a reasonable end time (either next segment start or +3 seconds)
  const sortedSegments = [...props.modelValue].sort((a, b) => a.start_time - b.start_time)
  const nextSegment = sortedSegments.find(s => s.start_time > time)
  const endTime = nextSegment ? Math.min(nextSegment.start_time, time + 5) : Math.min(time + 5, props.duration)

  const newSegment: Segment = {
    id: crypto.randomUUID(),
    video_id: '',
    segment_order: props.modelValue.length,
    label,
    start_time: time,
    end_time: endTime,
    transcript_raw: null,
    script_blueprint: null,
    visual_notes: null,
    tags: [],
    created_at: new Date().toISOString()
  }

  const updated = [...props.modelValue, newSegment].sort((a, b) => a.start_time - b.start_time)
  emit('update:modelValue', updated.map((s, i) => ({ ...s, segment_order: i })))
  showAddMenu.value = false
}

function removeSegment(id: string) {
  const updated = props.modelValue
    .filter(s => s.id !== id)
    .sort((a, b) => a.start_time - b.start_time)
    .map((s, i) => ({ ...s, segment_order: i }))
  emit('update:modelValue', updated)
}

function updateSegmentTime(id: string, handle: 'start' | 'end', time: number) {
  const segment = props.modelValue.find(s => s.id === id)
  if (!segment) return

  const updates: Partial<Segment> = {}
  if (handle === 'start' && time < segment.end_time - 0.5) {
    updates.start_time = Math.max(0, time)
  } else if (handle === 'end' && time > segment.start_time + 0.5) {
    updates.end_time = Math.min(props.duration, time)
  }

  if (Object.keys(updates).length > 0) {
    const updated = props.modelValue.map(s => s.id === id ? { ...s, ...updates } : s)
    emit('update:modelValue', updated)
  }
}

function startDrag(segmentId: string, handle: 'start' | 'end', event: MouseEvent) {
  event.stopPropagation()

  const handleMouseMove = (e: MouseEvent) => {
    const timeline = document.querySelector('[data-timeline]') as HTMLElement
    if (!timeline) return

    const rect = timeline.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = percent * props.duration
    updateSegmentTime(segmentId, handle, time)
  }

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// Quick templates
function applyTemplate(template: string) {
  let segments: Array<{ label: string; startPercent: number; endPercent: number }> = []

  switch (template) {
    case 'hook-value-cta':
      segments = [
        { label: 'Hook', startPercent: 0, endPercent: 0.15 },
        { label: 'Value', startPercent: 0.15, endPercent: 0.85 },
        { label: 'CTA', startPercent: 0.85, endPercent: 1 }
      ]
      break
    case 'hook-bridge-value-cta':
      segments = [
        { label: 'Hook', startPercent: 0, endPercent: 0.1 },
        { label: 'Bridge', startPercent: 0.1, endPercent: 0.25 },
        { label: 'Value', startPercent: 0.25, endPercent: 0.85 },
        { label: 'CTA', startPercent: 0.85, endPercent: 1 }
      ]
      break
    case 'hook-bridge-value-proof-cta':
      segments = [
        { label: 'Hook', startPercent: 0, endPercent: 0.1 },
        { label: 'Bridge', startPercent: 0.1, endPercent: 0.2 },
        { label: 'Value', startPercent: 0.2, endPercent: 0.65 },
        { label: 'Proof', startPercent: 0.65, endPercent: 0.85 },
        { label: 'CTA', startPercent: 0.85, endPercent: 1 }
      ]
      break
  }

  const newSegments: Segment[] = segments.map((s, i) => ({
    id: crypto.randomUUID(),
    video_id: '',
    segment_order: i,
    label: s.label,
    start_time: s.startPercent * props.duration,
    end_time: s.endPercent * props.duration,
    transcript_raw: null,
    script_blueprint: null,
    visual_notes: null,
    tags: [],
    created_at: new Date().toISOString()
  }))

  emit('update:modelValue', newSegments)
}

function clearAll() {
  emit('update:modelValue', [])
}

// Close menu when clicking outside
function handleClickOutside() {
  showAddMenu.value = false
}
</script>

<template>
  <div class="space-y-3" @click="handleClickOutside">
    <!-- Quick Templates -->
    <div v-if="modelValue.length === 0" class="flex flex-wrap gap-2">
      <UButton size="xs" variant="soft" @click="applyTemplate('hook-value-cta')">
        Hook → Value → CTA
      </UButton>
      <UButton size="xs" variant="soft" @click="applyTemplate('hook-bridge-value-cta')">
        + Bridge
      </UButton>
      <UButton size="xs" variant="soft" @click="applyTemplate('hook-bridge-value-proof-cta')">
        + Proof
      </UButton>
    </div>

    <!-- Timeline Track -->
    <div class="relative">
      <div
        data-timeline
        class="relative h-20 bg-neutral-100 dark:bg-neutral-800 rounded-lg cursor-pointer overflow-hidden"
        @click="handleTimelineClick"
        @contextmenu="handleTimelineRightClick"
      >
        <!-- Time markers -->
        <div class="absolute inset-x-0 top-0 h-5 flex items-center justify-between px-2 text-[10px] text-neutral-500 pointer-events-none">
          <span>0:00</span>
          <span>{{ formatTime(duration / 2) }}</span>
          <span>{{ formatTime(duration) }}</span>
        </div>

        <!-- Segments -->
        <div class="absolute inset-x-0 top-5 bottom-0 px-0.5">
          <div
            v-for="segment in modelValue"
            :key="segment.id"
            class="absolute top-1 bottom-1 rounded-md border-2 flex items-center justify-center text-white text-xs font-medium select-none group"
            :class="[getSegmentColor(segment.label), getSegmentBorder(segment.label)]"
            :style="{
              left: `${(segment.start_time / duration) * 100}%`,
              width: `${Math.max(2, ((segment.end_time - segment.start_time) / duration) * 100)}%`
            }"
          >
            <span class="truncate px-1 drop-shadow">{{ segment.label }}</span>

            <!-- Delete button on hover -->
            <button
              class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg"
              @click.stop="removeSegment(segment.id)"
            >
              <UIcon name="i-ph-x" class="w-3 h-3" />
            </button>

            <!-- Resize handles -->
            <div
              class="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l"
              @mousedown="(e) => startDrag(segment.id, 'start', e)"
            />
            <div
              class="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r"
              @mousedown="(e) => startDrag(segment.id, 'end', e)"
            />
          </div>

          <!-- Empty state hint -->
          <div v-if="modelValue.length === 0" class="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm pointer-events-none">
            Right-click to add a segment
          </div>
        </div>

        <!-- Playhead -->
        <div
          class="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-10 shadow-lg"
          :style="{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }"
        >
          <div class="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow" />
        </div>
      </div>

      <!-- Add Segment Menu (right-click) -->
      <div
        v-if="showAddMenu"
        class="absolute top-full mt-1 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 z-20"
        :style="{ left: `${addMenuPosition.x}px` }"
        @click.stop
      >
        <div class="px-3 py-1 text-xs text-neutral-500 border-b border-neutral-100 dark:border-neutral-800">
          Add at {{ formatTime(addMenuPosition.time) }}
        </div>
        <button
          v-for="label in SEGMENT_LABELS"
          :key="label"
          class="w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2"
          @click="addSegmentAtTime(label, addMenuPosition.time)"
        >
          <div class="w-3 h-3 rounded-full" :class="getSegmentColor(label)" />
          {{ label }}
        </button>
      </div>
    </div>

    <!-- Current time & segment count -->
    <div class="flex items-center justify-between text-xs text-neutral-500">
      <span>{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      <div class="flex items-center gap-2">
        <span>{{ modelValue.length }} segment{{ modelValue.length !== 1 ? 's' : '' }}</span>
        <UButton v-if="modelValue.length > 0" size="xs" variant="ghost" color="error" @click="clearAll">
          Clear All
        </UButton>
      </div>
    </div>
  </div>
</template>
