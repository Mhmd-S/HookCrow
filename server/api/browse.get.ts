export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const supabase = useServerSupabase()

  let dbQuery = supabase
    .from('videos')
    .select('id, title, creator_handle, platform, video_path, duration_seconds, logic_flow_id, semantic_tags, status, created_at, logic_flow:logic_flows(id, name, description)')
    .eq('is_published', true)
    .eq('status', 'complete')
    .order('updated_at', { ascending: false })

  // Domain/format tag filter (array overlap)
  if (query.tags) {
    const tags = String(query.tags).split(',').filter(Boolean)
    if (tags.length > 0) {
      dbQuery = dbQuery.overlaps('semantic_tags', tags)
    }
  }

  // Logic flow filter
  if (query.logic_flow_id) {
    validateUUID(String(query.logic_flow_id), 'logic_flow_id')
    dbQuery = dbQuery.eq('logic_flow_id', String(query.logic_flow_id))
  }

  // Search (title, creator_handle)
  if (query.search) {
    const term = sanitizeString(String(query.search)).trim()
    if (term) {
      dbQuery = dbQuery.or(`title.ilike.%${term}%,creator_handle.ilike.%${term}%`)
    }
  }

  // Pagination
  const page = Math.max(1, parseInt(String(query.page)) || 1)
  const limit = Math.min(Math.max(1, parseInt(String(query.limit)) || 24), 50)
  const from = (page - 1) * limit
  dbQuery = dbQuery.range(from, from + limit - 1)

  const { data, error } = await dbQuery

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  return { data: data || [], page, limit }
})
