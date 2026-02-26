export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const supabase = useServerSupabase()

  const updateData: Record<string, string> = {}
  if (body.display_name !== undefined) {
    updateData.display_name = body.display_name ? sanitizeString(String(body.display_name)).slice(0, 100) : ''
  }

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updateData as any)
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  return { data }
})
