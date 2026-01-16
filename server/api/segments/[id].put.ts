import type { SegmentUpdate } from '~/types'

const ALLOWED_LABELS = ['Hook', 'Bridge', 'Value', 'Proof', 'CTA'] as const

export default defineEventHandler(async (event) => {
  const id = validateUUID(getRouterParam(event, 'id'), 'segment id')
  const body = await readBody<SegmentUpdate>(event)

  if (!body || Object.keys(body).length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Request body is required'
    })
  }

  const sanitizedData: SegmentUpdate = {}

  // Validate and sanitize each field
  if (body.label !== undefined) {
    validateEnum(body.label, 'label', ALLOWED_LABELS)
    sanitizedData.label = body.label
  }

  if (body.segment_order !== undefined) {
    sanitizedData.segment_order = validateNumber(body.segment_order, 'segment_order', { min: 0, max: 100 })
  }

  if (body.start_time !== undefined) {
    sanitizedData.start_time = validateNumber(body.start_time, 'start_time', { min: 0 })
  }

  if (body.end_time !== undefined) {
    sanitizedData.end_time = validateNumber(body.end_time, 'end_time', { min: 0 })
  }

  // Validate time range if both are provided or being updated
  if (sanitizedData.start_time !== undefined && sanitizedData.end_time !== undefined) {
    if (sanitizedData.end_time <= sanitizedData.start_time) {
      throw createError({
        statusCode: 400,
        message: 'end_time must be greater than start_time'
      })
    }
  }

  if (body.transcript_raw !== undefined) {
    sanitizedData.transcript_raw = body.transcript_raw ? String(body.transcript_raw).slice(0, 10000) : null
  }

  if (body.script_blueprint !== undefined) {
    sanitizedData.script_blueprint = body.script_blueprint ? String(body.script_blueprint).slice(0, 10000) : null
  }

  if (body.visual_notes !== undefined) {
    sanitizedData.visual_notes = body.visual_notes ? sanitizeString(body.visual_notes).slice(0, 5000) : null
  }

  if (body.tags !== undefined) {
    sanitizedData.tags = Array.isArray(body.tags) ? body.tags.filter(t => typeof t === 'string').slice(0, 20) : null
  }

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('segments')
    .update(sanitizedData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw createError({
        statusCode: 404,
        message: 'Segment not found'
      })
    }
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
