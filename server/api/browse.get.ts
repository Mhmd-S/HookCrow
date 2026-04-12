const log = createLogger('browse')

// Anonymous visitors get a capped teaser of the free catalogue — enough to
// showcase the library without giving the whole thing away.
const ANON_TEASER_LIMIT = 6

async function fallbackBrowse(
  supabase: ReturnType<typeof useServerSupabase>,
  opts: {
    searchTerm: string
    tags: string[]
    logicFlowId: string | null
    limit: number
    offset: number
    page: number
    anon: boolean
  }
) {
  let q = supabase
    .from('videos')
    .select('id, title, creator_handle, platform, video_path, duration_seconds, logic_flow_id, semantic_tags, status, is_premium, created_at, logic_flow:logic_flows(id, name, description)', { count: 'exact' })
    .eq('is_published', true)
    .eq('status', 'complete')
    .order('updated_at', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1)

  if (opts.anon) {
    q = q.eq('is_premium', false)
  }
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
  const user = await getServerUser(event)
  const anon = !user
  const query = getQuery(event)
  const supabase = useServerSupabase()

  const page = Math.max(1, parseInt(String(query.page)) || 1)
  const requestedLimit = Math.min(Math.max(1, parseInt(String(query.limit)) || 24), 50)
  // Anonymous callers are clamped to the teaser limit regardless of what they ask for.
  const limit = anon ? Math.min(requestedLimit, ANON_TEASER_LIMIT) : requestedLimit
  const effectivePage = anon ? 1 : page
  const offset = (effectivePage - 1) * limit

  const searchTerm = query.search ? sanitizeString(String(query.search)).trim() : ''
  const keywords = query.keywords ? String(query.keywords).split(',').filter(Boolean) : []
  const tags = query.tags ? String(query.tags).split(',').filter(Boolean) : []
  const logicFlowId = query.logic_flow_id ? String(query.logic_flow_id) : null

  if (logicFlowId) {
    validateUUID(logicFlowId, 'logic_flow_id')
  }

  const searchParts: string[] = []
  if (searchTerm) searchParts.push(searchTerm)
  if (keywords.length > 0) searchParts.push(keywords.join(' OR '))
  const searchQuery = searchParts.join(' OR ') || null

  if (searchQuery) {
    log.info('Full-text search', { searchQuery, tags, logicFlowId, anon })
  }

  // RPC returns published+complete rows regardless of premium; we post-filter
  // for anon callers below so we keep the same RPC surface for both cases.
  // `result_limit * 2` gives headroom when the first N include premium rows
  // that we then drop for anon viewers.
  const rpcLimit = anon ? limit * 3 : limit
  const { data, error } = await (supabase.rpc as any)('search_videos', {
    search_query: searchQuery,
    tag_filter: tags.length > 0 ? tags : null,
    logic_flow_filter: logicFlowId,
    result_limit: rpcLimit,
    result_offset: offset
  }) as { data: any[] | null; error: any }

  if (error) {
    log.error('Search RPC failed', new Error(error.message), { code: error.code, details: error.details })

    if (error.code === '42883' || error.message?.includes('function') || error.code === 'PGRST202') {
      log.info('Falling back to direct query (search_videos RPC not found)')
      return await fallbackBrowse(supabase, { searchTerm, tags, logicFlowId, limit, offset, page: effectivePage, anon })
    }

    throw createError({ statusCode: 500, message: error.message })
  }

  let rows = data || []
  if (anon) {
    rows = rows.filter((r: any) => !r.is_premium).slice(0, limit)
  }

  const videos = rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    creator_handle: row.creator_handle,
    platform: row.platform,
    video_path: row.video_path,
    duration_seconds: row.duration_seconds,
    logic_flow_id: row.logic_flow_id,
    semantic_tags: row.semantic_tags,
    status: row.status,
    is_premium: row.is_premium,
    created_at: row.created_at,
    logic_flow: row.logic_flow_name ? {
      id: row.logic_flow_id,
      name: row.logic_flow_name,
      description: row.logic_flow_description
    } : null
  }))

  return {
    data: videos,
    page: effectivePage,
    limit,
    anon,
    teaser_limit: anon ? ANON_TEASER_LIMIT : null
  }
})
