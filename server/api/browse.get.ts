const log = createLogger('browse')

async function fallbackBrowse(
  supabase: ReturnType<typeof useServerSupabase>,
  opts: { searchTerm: string; tags: string[]; logicFlowId: string | null; limit: number; offset: number; page: number }
) {
  let q = supabase
    .from('videos')
    .select('id, title, creator_handle, platform, video_path, duration_seconds, logic_flow_id, semantic_tags, status, created_at, logic_flow:logic_flows(id, name, description)', { count: 'exact' })
    .eq('is_published', true)
    .eq('status', 'complete')
    .order('updated_at', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1)

  if (opts.logicFlowId) {
    q = q.eq('logic_flow_id', opts.logicFlowId)
  }
  if (opts.tags.length > 0) {
    q = q.overlaps('semantic_tags', opts.tags)
  }
  if (opts.searchTerm) {
    q = q.or(`title.ilike.%${opts.searchTerm}%,creator_handle.ilike.%${opts.searchTerm}%`)
  }

  const { data, error: fbError } = await q

  if (fbError) {
    log.error('Fallback browse query failed', new Error(fbError.message))
    throw createError({ statusCode: 500, message: fbError.message })
  }

  return { data: data || [], page: opts.page, limit: opts.limit }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const supabase = useServerSupabase()

  // Pagination
  const page = Math.max(1, parseInt(String(query.page)) || 1)
  const limit = Math.min(Math.max(1, parseInt(String(query.limit)) || 24), 50)
  const offset = (page - 1) * limit

  // Parse filters
  const searchTerm = query.search ? sanitizeString(String(query.search)).trim() : ''
  const keywords = query.keywords ? String(query.keywords).split(',').filter(Boolean) : []
  const tags = query.tags ? String(query.tags).split(',').filter(Boolean) : []
  const logicFlowId = query.logic_flow_id ? String(query.logic_flow_id) : null

  if (logicFlowId) {
    validateUUID(logicFlowId, 'logic_flow_id')
  }

  // Build the full-text search query string for the RPC
  // Combine search term + keywords into a single websearch query
  const searchParts: string[] = []
  if (searchTerm) searchParts.push(searchTerm)
  if (keywords.length > 0) searchParts.push(keywords.join(' OR '))
  const searchQuery = searchParts.join(' OR ') || null

  if (searchQuery) {
    log.info('Full-text search', { searchQuery, tags, logicFlowId })
  }

  // Use the RPC function for relevance-ranked search
  // Cast to any because the search_videos RPC is not in the generated database types yet
  const { data, error } = await (supabase.rpc as any)('search_videos', {
    search_query: searchQuery,
    tag_filter: tags.length > 0 ? tags : null,
    logic_flow_filter: logicFlowId,
    result_limit: limit,
    result_offset: offset
  }) as { data: any[] | null; error: any }

  if (error) {
    log.error('Search RPC failed', new Error(error.message), { code: error.code, details: error.details })

    // Fallback: if the RPC function doesn't exist, use a direct query
    if (error.code === '42883' || error.message?.includes('function') || error.code === 'PGRST202') {
      log.info('Falling back to direct query (search_videos RPC not found)')
      return await fallbackBrowse(supabase, { searchTerm, tags, logicFlowId, limit, offset, page })
    }

    throw createError({ statusCode: 500, message: error.message })
  }

  // Transform RPC results to match the existing response shape
  // The RPC returns flat columns; reshape logic_flow into a nested object
  const videos = (data || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    creator_handle: row.creator_handle,
    platform: row.platform,
    video_path: row.video_path,
    duration_seconds: row.duration_seconds,
    logic_flow_id: row.logic_flow_id,
    semantic_tags: row.semantic_tags,
    status: row.status,
    created_at: row.created_at,
    logic_flow: row.logic_flow_name ? {
      id: row.logic_flow_id,
      name: row.logic_flow_name,
      description: row.logic_flow_description
    } : null
  }))

  return { data: videos, page, limit }
})
