import type { VideoUpdate } from '~/types'
import { VIDEO_STATUSES } from '~/types'

export default defineEventHandler(async (event) => {
  const id = validateUUID(getRouterParam(event, 'id'), 'video id')
  const body = await readBody<VideoUpdate>(event)

  if (!body || Object.keys(body).length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Request body is required'
    })
  }

  const sanitizedData: VideoUpdate = {}

  // Validate and sanitize each allowed field
  if (body.creator_handle !== undefined) {
    sanitizedData.creator_handle = body.creator_handle ? sanitizeString(body.creator_handle).slice(0, 100) : null
  }

  if (body.platform !== undefined) {
    sanitizedData.platform = body.platform || null
  }

  if (body.source_url !== undefined) {
    if (body.source_url) {
      try {
        new URL(body.source_url)
        sanitizedData.source_url = body.source_url.slice(0, 2000)
      } catch {
        throw createError({
          statusCode: 400,
          message: 'source_url must be a valid URL'
        })
      }
    } else {
      sanitizedData.source_url = null
    }
  }

  if (body.logic_flow_id !== undefined) {
    if (body.logic_flow_id) {
      validateUUID(body.logic_flow_id, 'logic_flow_id')
      sanitizedData.logic_flow_id = body.logic_flow_id
    } else {
      sanitizedData.logic_flow_id = null
    }
  }

  if (body.script_raw !== undefined) {
    sanitizedData.script_raw = body.script_raw ? String(body.script_raw).slice(0, 50000) : null
  }

  if (body.script_blueprint !== undefined) {
    sanitizedData.script_blueprint = body.script_blueprint ? String(body.script_blueprint).slice(0, 50000) : null
  }

  if (body.status !== undefined) {
    sanitizedData.status = validateEnum(body.status, 'status', VIDEO_STATUSES)
  }

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('videos')
    .update(sanitizedData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw createError({
        statusCode: 404,
        message: 'Video not found'
      })
    }
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
