import type { SegmentInsert } from '~/types'

const ALLOWED_LABELS = ['Hook', 'Bridge', 'Value', 'Proof', 'CTA'] as const

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<SegmentInsert>(event)

  // Validate required fields
  const videoId = validateUUID(body?.video_id, 'video_id')
  const label = validateRequired(body?.label, 'label')
  validateEnum(label, 'label', ALLOWED_LABELS)

  const segmentOrder = validateNumber(body?.segment_order, 'segment_order', { min: 0, max: 100 })
  const startTime = validateNumber(body?.start_time, 'start_time', { min: 0 })
  const endTime = validateNumber(body?.end_time, 'end_time', { min: 0 })

  if (endTime <= startTime) {
    throw createError({
      statusCode: 400,
      message: 'end_time must be greater than start_time'
    })
  }

  const sanitizedData: SegmentInsert = {
    video_id: videoId,
    label,
    segment_order: segmentOrder,
    start_time: startTime,
    end_time: endTime,
    transcript_raw: body.transcript_raw ? String(body.transcript_raw).slice(0, 10000) : null,
    script_blueprint: body.script_blueprint ? String(body.script_blueprint).slice(0, 10000) : null,
    visual_notes: body.visual_notes ? sanitizeString(body.visual_notes).slice(0, 5000) : null,
    tags: Array.isArray(body.tags) ? body.tags.filter(t => typeof t === 'string').slice(0, 20) : null
  }

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('segments')
    .insert(sanitizedData)
    .select()
    .single()

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
