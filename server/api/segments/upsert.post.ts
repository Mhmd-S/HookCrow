import type { SegmentInsert } from '~/types'

const ALLOWED_LABELS = ['Hook', 'Bridge', 'Value', 'Proof', 'CTA'] as const

interface UpsertBody {
  videoId: string
  segments: SegmentInsert[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<UpsertBody>(event)

  const videoId = validateUUID(body?.videoId, 'videoId')
  const segments = validateArray<SegmentInsert>(body?.segments, 'segments')

  // Limit number of segments
  if (segments.length > 50) {
    throw createError({
      statusCode: 400,
      message: 'Maximum 50 segments allowed'
    })
  }

  // Validate each segment
  const sanitizedSegments: SegmentInsert[] = segments.map((seg, index) => {
    if (!seg.label || !ALLOWED_LABELS.includes(seg.label as any)) {
      throw createError({
        statusCode: 400,
        message: `Segment ${index}: invalid label`
      })
    }

    const startTime = validateNumber(seg.start_time, `segment ${index} start_time`, { min: 0 })
    const endTime = validateNumber(seg.end_time, `segment ${index} end_time`, { min: 0 })

    if (endTime <= startTime) {
      throw createError({
        statusCode: 400,
        message: `Segment ${index}: end_time must be greater than start_time`
      })
    }

    return {
      video_id: videoId,
      label: seg.label,
      segment_order: validateNumber(seg.segment_order ?? index, `segment ${index} segment_order`, { min: 0, max: 100 }),
      start_time: startTime,
      end_time: endTime,
      transcript_raw: seg.transcript_raw ? String(seg.transcript_raw).slice(0, 10000) : null,
      script_blueprint: seg.script_blueprint ? String(seg.script_blueprint).slice(0, 10000) : null,
      visual_notes: seg.visual_notes ? sanitizeString(seg.visual_notes).slice(0, 5000) : null,
      tags: Array.isArray(seg.tags) ? seg.tags.filter(t => typeof t === 'string').slice(0, 20) : null
    }
  })

  const supabase = useServerSupabase()

  // Verify video exists
  const { data: video } = await supabase
    .from('videos')
    .select('id')
    .eq('id', videoId)
    .single()

  if (!video) {
    throw createError({
      statusCode: 404,
      message: 'Video not found'
    })
  }

  // Delete existing segments for this video
  const { error: deleteError } = await supabase
    .from('segments')
    .delete()
    .eq('video_id', videoId)

  if (deleteError) {
    throw createError({
      statusCode: 500,
      message: deleteError.message
    })
  }

  // Insert new segments if any
  if (sanitizedSegments.length === 0) {
    return { data: [] }
  }

  const { data, error } = await supabase
    .from('segments')
    .insert(sanitizedSegments)
    .select()

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
