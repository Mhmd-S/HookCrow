export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = validateUUID(getRouterParam(event, 'id'), 'discovery source id')
  const body = await readBody<{
    enabled?: boolean
    max_per_run?: number
    cadence_hours?: number
    value?: string
  }>(event)

  const supabase = useServerSupabase()

  // Check existence
  const { data: existing } = await supabase
    .from('discovery_sources')
    .select('id')
    .eq('id', id)
    .single()

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Discovery source not found' })
  }

  const update: Record<string, unknown> = {}

  if (body?.enabled !== undefined) {
    update.enabled = Boolean(body.enabled)
  }
  if (body?.max_per_run !== undefined) {
    const n = Number(body.max_per_run)
    if (isNaN(n) || n < 1) throw createError({ statusCode: 400, message: 'max_per_run must be a positive number' })
    update.max_per_run = n
  }
  if (body?.cadence_hours !== undefined) {
    const n = Number(body.cadence_hours)
    if (isNaN(n) || n < 1) throw createError({ statusCode: 400, message: 'cadence_hours must be a positive number' })
    update.cadence_hours = n
  }
  if (body?.value !== undefined) {
    update.value = String(body.value).slice(0, 200)
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  const { data, error } = await supabase
    .from('discovery_sources')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, message: 'source already exists' })
    }
    throw createError({ statusCode: 500, message: error.message })
  }

  return { data }
})
