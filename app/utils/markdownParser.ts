import { SEGMENT_LABELS } from '~/types'
import type { Segment, SegmentLabel } from '~/types'

export interface ParsedSegment {
  startTime: number
  endTime: number
  label: string
  description: string
  lineNumber: number
}

export interface ParseError {
  line: number
  message: string
  severity: 'error' | 'warning'
}

export interface ParseResult {
  segments: ParsedSegment[]
  errors: ParseError[]
}

/**
 * Parse time string to seconds
 * Supports: "3s", "3", "0:03", "1:30"
 */
function parseTime(timeStr: string): number | null {
  const trimmed = timeStr.trim()

  // Format: "3s" or "30s" (seconds with 's' suffix)
  const secondsMatch = trimmed.match(/^(\d+)s?$/)
  if (secondsMatch) {
    return parseInt(secondsMatch[1], 10)
  }

  // Format: "0:03" or "1:30" (mm:ss)
  const mmssMatch = trimmed.match(/^(\d+):(\d{2})$/)
  if (mmssMatch) {
    const minutes = parseInt(mmssMatch[1], 10)
    const seconds = parseInt(mmssMatch[2], 10)
    return minutes * 60 + seconds
  }

  return null
}

/**
 * Format seconds to time string for markdown
 * Uses simple "Xs" format for times under 60s, "M:SS" for longer
 */
export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Parse a single line of segment markdown
 * Format: "0-3s [Hook]: Description text here"
 * Returns null if line doesn't match expected format
 */
function parseLine(line: string, lineNumber: number): { segment: ParsedSegment | null; error: ParseError | null } {
  const trimmed = line.trim()

  // Skip empty lines
  if (!trimmed) {
    return { segment: null, error: null }
  }

  // Skip comment lines
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return { segment: null, error: null }
  }

  // Main pattern: time-time [Label]: description
  // Captures: (startTime)-(endTime) [(label)]: (description)
  const pattern = /^(\d+(?::\d{2})?s?)\s*-\s*(\d+(?::\d{2})?s?)\s*\[([^\]]+)\]:\s*(.*)$/
  const match = trimmed.match(pattern)

  if (!match) {
    // Check if it looks like a segment line but is malformed
    if (trimmed.includes('[') && trimmed.includes(']:')) {
      return {
        segment: null,
        error: {
          line: lineNumber,
          message: 'Invalid segment format. Expected: "0-3s [Hook]: Description"',
          severity: 'error'
        }
      }
    }
    // Non-segment line (could be a note or other content)
    return { segment: null, error: null }
  }

  const [, startStr, endStr, labelStr, description] = match

  // Parse times
  const startTime = parseTime(startStr)
  const endTime = parseTime(endStr)

  if (startTime === null) {
    return {
      segment: null,
      error: {
        line: lineNumber,
        message: `Invalid start time: "${startStr}"`,
        severity: 'error'
      }
    }
  }

  if (endTime === null) {
    return {
      segment: null,
      error: {
        line: lineNumber,
        message: `Invalid end time: "${endStr}"`,
        severity: 'error'
      }
    }
  }

  if (endTime <= startTime) {
    return {
      segment: null,
      error: {
        line: lineNumber,
        message: `End time (${endStr}) must be greater than start time (${startStr})`,
        severity: 'error'
      }
    }
  }

  // Validate label
  const label = labelStr.trim()
  const validLabels = SEGMENT_LABELS as readonly string[]
  const isValidLabel = validLabels.includes(label)

  if (!isValidLabel) {
    return {
      segment: {
        startTime,
        endTime,
        label: 'Value', // Default to Value for invalid labels
        description: description.trim(),
        lineNumber
      },
      error: {
        line: lineNumber,
        message: `Unknown label "${label}". Valid labels: ${SEGMENT_LABELS.join(', ')}. Defaulting to "Value".`,
        severity: 'warning'
      }
    }
  }

  return {
    segment: {
      startTime,
      endTime,
      label,
      description: description.trim(),
      lineNumber
    },
    error: null
  }
}

/**
 * Parse segment markdown into structured segments
 */
export function parseSegmentMarkdown(markdown: string): ParseResult {
  const lines = markdown.split('\n')
  const segments: ParsedSegment[] = []
  const errors: ParseError[] = []

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1 // 1-indexed for user display
    const { segment, error } = parseLine(lines[i], lineNumber)

    if (segment) {
      segments.push(segment)
    }
    if (error) {
      errors.push(error)
    }
  }

  // Check for overlapping segments
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime)
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]
    const next = sorted[i + 1]
    if (current.endTime > next.startTime) {
      errors.push({
        line: next.lineNumber,
        message: `Overlapping time range with previous segment (${formatTime(current.startTime)}-${formatTime(current.endTime)})`,
        severity: 'warning'
      })
    }
  }

  return { segments, errors }
}

/**
 * Generate markdown from segments
 */
export function generateSegmentMarkdown(segments: Segment[]): string {
  if (!segments || segments.length === 0) {
    return ''
  }

  const sorted = [...segments].sort((a, b) => a.start_time - b.start_time)

  return sorted
    .map((seg) => {
      const start = formatTime(seg.start_time)
      const end = formatTime(seg.end_time)
      const description = seg.script_blueprint || ''
      return `${start}-${end} [${seg.label}]: ${description}`
    })
    .join('\n')
}

/**
 * Convert ParsedSegment to database Segment format
 */
export function parsedToSegment(
  parsed: ParsedSegment,
  videoId: string,
  order: number,
  existingSegment?: Partial<Segment>
): Segment {
  return {
    id: existingSegment?.id || '',
    video_id: videoId,
    segment_order: order,
    label: parsed.label as SegmentLabel,
    start_time: parsed.startTime,
    end_time: parsed.endTime,
    transcript_raw: existingSegment?.transcript_raw || null,
    script_blueprint: parsed.description || null,
    visual_notes: existingSegment?.visual_notes || null,
    tags: existingSegment?.tags || null,
    created_at: existingSegment?.created_at || new Date().toISOString()
  }
}

/**
 * Merge parsed segments with existing segments, preserving data
 * that isn't represented in markdown (transcript, visual notes, tags)
 */
export function mergeWithExisting(
  parsed: ParsedSegment[],
  existing: Segment[],
  videoId: string
): Segment[] {
  const sortedParsed = [...parsed].sort((a, b) => a.startTime - b.startTime)

  return sortedParsed.map((p, index) => {
    // Try to find matching existing segment by time range (with small tolerance)
    const match = existing.find(
      (e) =>
        Math.abs(e.start_time - p.startTime) < 0.5 &&
        Math.abs(e.end_time - p.endTime) < 0.5 &&
        e.label === p.label
    )

    return parsedToSegment(p, videoId, index, match)
  })
}
