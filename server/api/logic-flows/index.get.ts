export default defineEventHandler(async () => {
  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('logic_flows')
    .select('*')
    .order('name')

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
