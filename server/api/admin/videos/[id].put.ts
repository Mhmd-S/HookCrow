import type { VideoUpdate } from '~/types'
import { VIDEO_STATUSES } from '~/types'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

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

  if (body.semantic_tags !== undefined) {
    if (Array.isArray(body.semantic_tags)) {
      sanitizedData.semantic_tags = body.semantic_tags
        .map((t) => sanitizeString(String(t)).slice(0, 60))
        .filter((t) => t.length > 0)
        .slice(0, 50)
    } else if (body.semantic_tags === null) {
      sanitizedData.semantic_tags = null
    } else {
      throw createError({
        statusCode: 400,
        message: 'semantic_tags must be an array of strings or null'
      })
    }
  }

  if (body.skeletal_logic !== undefined) {
    if (body.skeletal_logic === null || typeof body.skeletal_logic === 'object') {
      try {
        const jsonSize = JSON.stringify(body.skeletal_logic ?? null).length
        if (jsonSize > 250000) {
          throw new Error('skeletal_logic is too large')
        }
      } catch (err) {
        throw createError({
          statusCode: 400,
          message: err instanceof Error ? err.message : 'Invalid skeletal_logic JSON'
        })
      }
      sanitizedData.skeletal_logic = body.skeletal_logic as unknown as VideoUpdate['skeletal_logic']
    } else {
      throw createError({
        statusCode: 400,
        message: 'skeletal_logic must be a JSON object or null'
      })
    }
  }

  if (body.audio_analysis !== undefined) {
    if (body.audio_analysis === null || typeof body.audio_analysis === 'object') {
      try {
        const jsonSize = JSON.stringify(body.audio_analysis ?? null).length
        if (jsonSize > 250000) {
          throw new Error('audio_analysis is too large')
        }
      } catch (err) {
        throw createError({
          statusCode: 400,
          message: err instanceof Error ? err.message : 'Invalid audio_analysis JSON'
        })
      }
      sanitizedData.audio_analysis = body.audio_analysis as unknown as VideoUpdate['audio_analysis']
    } else {
      throw createError({
        statusCode: 400,
        message: 'audio_analysis must be a JSON object or null'
      })
    }
  }

  if (body.status !== undefined) {
    sanitizedData.status = validateEnum(body.status, 'status', VIDEO_STATUSES)
  }

  if (body.title !== undefined) {
    sanitizedData.title = body.title ? sanitizeString(String(body.title)).slice(0, 200) : null
  }

  if (body.description !== undefined) {
    sanitizedData.description = body.description ? sanitizeString(String(body.description)).slice(0, 2000) : null
  }

  if (body.is_published !== undefined) {
    sanitizedData.is_published = Boolean(body.is_published)
  }

  if (body.is_premium !== undefined) {
    sanitizedData.is_premium = Boolean(body.is_premium)
  }

  if (body.visual_analysis !== undefined) {
    if (body.visual_analysis === null || typeof body.visual_analysis === 'object') {
      try {
        const jsonSize = JSON.stringify(body.visual_analysis ?? null).length
        if (jsonSize > 500000) {
          throw new Error('visual_analysis is too large')
        }
      } catch (err) {
        throw createError({
          statusCode: 400,
          message: err instanceof Error ? err.message : 'Invalid visual_analysis JSON'
        })
      }
      sanitizedData.visual_analysis = body.visual_analysis as unknown as VideoUpdate['visual_analysis']
    } else {
      throw createError({
        statusCode: 400,
        message: 'visual_analysis must be a JSON object or null'
      })
    }
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
