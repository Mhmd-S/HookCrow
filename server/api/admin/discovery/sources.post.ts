export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{
    type: string
    value: string
    max_per_run?: number
    cadence_hours?: number
  }>(event)

  const type = validateEnum(body?.type, 'type', ['hashtag', 'profile', 'search'] as const)
  const value = validateString(body?.value, 'value', { minLength: 1, maxLength: 200 })

  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('discovery_sources')
    .insert({
      type,
      value,
      max_per_run: body?.max_per_run ?? 10,
      cadence_hours: body?.cadence_hours ?? 24,
    })
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
