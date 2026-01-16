import type { Ref } from 'vue'
import type { Segment } from '~/types'
import {
  parseSegmentMarkdown,
  generateSegmentMarkdown,
  mergeWithExisting,
  type ParseError
} from '~/utils/markdownParser'

export interface MarkdownSyncOptions {
  videoId: string
  debounceMs?: number
}

export function useMarkdownSync(
  segments: Ref<Segment[]>,
  options: MarkdownSyncOptions
) {
  const markdown = ref('')
  const parseErrors = ref<ParseError[]>([])
  const isSyncing = ref(false)

  // Track sync direction to prevent circular updates
  let syncDirection: 'markdown' | 'segments' | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const debounceMs = options.debounceMs ?? 300

  /**
   * Update segments from markdown (debounced)
   */
  function updateSegmentsFromMarkdown(md: string) {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      if (syncDirection === 'segments') {
        syncDirection = null
        return
      }

      syncDirection = 'markdown'
      isSyncing.value = true

      const { segments: parsed, errors } = parseSegmentMarkdown(md)
      parseErrors.value = errors

      if (parsed.length > 0) {
        // Merge with existing to preserve transcript, visual notes, tags
        const merged = mergeWithExisting(parsed, segments.value, options.videoId)
        segments.value = merged
      } else if (md.trim() === '') {
        // Empty markdown = clear segments (but we keep existing if there are errors)
        if (errors.length === 0) {
          segments.value = []
        }
      }

      isSyncing.value = false
      syncDirection = null
    }, debounceMs)
  }

  /**
   * Update markdown from segments (immediate)
   */
  function updateMarkdownFromSegments(segs: Segment[]) {
    if (syncDirection === 'markdown') {
      syncDirection = null
      return
    }

    syncDirection = 'segments'
    markdown.value = generateSegmentMarkdown(segs)
    parseErrors.value = [] // Clear errors when updating from segments
    syncDirection = null
  }

  /**
   * Initialize markdown from current segments
   */
  function initFromSegments() {
    markdown.value = generateSegmentMarkdown(segments.value)
    parseErrors.value = []
  }

  /**
   * Apply template markdown to current video
   * Optionally scales times to fit video duration
   */
  function applyTemplate(templateMarkdown: string, videoDuration?: number) {
    const { segments: parsed, errors } = parseSegmentMarkdown(templateMarkdown)

    if (parsed.length === 0) {
      parseErrors.value = errors
      return
    }

    let scaledSegments = parsed

    // Scale times if duration provided
    if (videoDuration && videoDuration > 0) {
      const maxTime = Math.max(...parsed.map((s) => s.endTime))
      if (maxTime > 0) {
        const scaleFactor = videoDuration / maxTime
        scaledSegments = parsed.map((s) => ({
          ...s,
          startTime: Math.round(s.startTime * scaleFactor * 10) / 10,
          endTime: Math.round(s.endTime * scaleFactor * 10) / 10
        }))
      }
    }

    // Convert to Segment format
    const newSegments = scaledSegments.map((p, index) => ({
      id: '',
      video_id: options.videoId,
      segment_order: index,
      label: p.label,
      start_time: p.startTime,
      end_time: p.endTime,
      transcript_raw: null,
      script_blueprint: p.description,
      visual_notes: null,
      tags: null,
      created_at: new Date().toISOString()
    })) as Segment[]

    syncDirection = 'segments'
    segments.value = newSegments
    markdown.value = generateSegmentMarkdown(newSegments)
    parseErrors.value = errors.length > 0 ? errors : []
    syncDirection = null
  }

  // Watch markdown for changes (user typing)
  watch(markdown, (newMd) => {
    updateSegmentsFromMarkdown(newMd)
  })

  // Watch segments for changes (from segment cards or timeline)
  watch(
    segments,
    (newSegs) => {
      updateMarkdownFromSegments(newSegs)
    },
    { deep: true }
  )

  // Initialize on mount if segments exist
  onMounted(() => {
    if (segments.value.length > 0) {
      initFromSegments()
    }
  })

  return {
    markdown,
    parseErrors,
    isSyncing,
    initFromSegments,
    applyTemplate
  }
}
