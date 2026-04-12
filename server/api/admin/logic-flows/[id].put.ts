import type { LogicFlowUpdate } from '~/types'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = validateUUID(getRouterParam(event, 'id'), 'logic flow id')
  const body = await readBody<LogicFlowUpdate>(event)

  if (!body || Object.keys(body).length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Request body is required'
    })
  }

  const sanitizedData: LogicFlowUpdate = {}

  // Validate and sanitize each allowed field
  if (body.name !== undefined) {
    if (!body.name || body.name.trim().length === 0) {
      throw createError({
        statusCode: 400,
        message: 'name cannot be empty'
      })
    }
    sanitizedData.name = sanitizeString(body.name).slice(0, 200)
  }

  if (body.description !== undefined) {
    sanitizedData.description = body.description
      ? sanitizeString(body.description).slice(0, 2000)
      : null
  }

  if (body.template_markdown !== undefined) {
    sanitizedData.template_markdown = body.template_markdown
      ? String(body.template_markdown).slice(0, 100000)
      : null
  }

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('logic_flows')
    .update(sanitizedData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw createError({
        statusCode: 404,
        message: 'Logic flow not found'
      })
    }
    if (error.code === '23505') {
      throw createError({
        statusCode: 409,
        message: 'A logic flow with this name already exists'
      })
    }
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
