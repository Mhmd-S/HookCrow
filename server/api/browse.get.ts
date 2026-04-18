const log = createLogger('browse')

async function fallbackBrowse(
  supabase: ReturnType<typeof useServerSupabase>,
  opts: {
    searchTerm: string
    keywords: string[]
    tags: string[]
    logicFlowId: string | null
    limit: number
    offset: number
    page: number
    freeTier?: boolean
    effectiveLimit?: number
  }
) {
  let q = supabase
    .from('videos')
    .select('id, title, creator_handle, platform, video_path, duration_seconds, logic_flow_id, semantic_tags, status, is_premium, created_at, logic_flow:logic_flows(id, name, description)', { count: 'exact' })
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
  if (opts.freeTier) {
    q = q.eq('is_premium', false)
  }
  // Broaden recall: OR across title, description, creator_handle for the raw
  // search term plus every AI-extracted keyword. Commas and parens break
  // PostgREST's `.or()` syntax, so we strip them before interpolation.
  const orTerms = [opts.searchTerm, ...opts.keywords]
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(t => t.replace(/[,()]/g, ' ').trim())
    .filter(t => t.length > 0)
  if (orTerms.length > 0) {
    const clauses = orTerms.flatMap(t => [
      `title.ilike.%${t}%`,
      `description.ilike.%${t}%`,
      `creator_handle.ilike.%${t}%`
    ])
    q = q.or(clauses.join(','))
  }

  const { data, error: fbError } = await q

  if (fbError) {
    log.error('Fallback browse query failed', new Error(fbError.message))
    throw createError({ statusCode: 500, message: fbError.message })
  }

  const rows = data || []
  const capped = opts.effectiveLimit != null ? rows.slice(0, opts.effectiveLimit) : rows
  return { data: capped, page: opts.page, limit: opts.effectiveLimit ?? opts.limit }
}

export default defineEventHandler(async (event) => {
  const user = await getServerUser(event)
  const anon = !user
  const isPro = user?.subscriptionStatus === 'active'
  const isAdmin = user?.role === 'admin'
  const freeTier = !isPro && !isAdmin
  const query = getQuery(event)
  const supabase = useServerSupabase()

  const page = Math.max(1, parseInt(String(query.page)) || 1)
  const requestedLimit = Math.min(Math.max(1, parseInt(String(query.limit)) || 24), 50)

  // Free tier: cap to 10 non-premium results, no pagination beyond that.
  // We over-fetch from the RPC to compensate for post-filtering of premium rows.
  const effectiveLimit = freeTier ? Math.min(requestedLimit, 10) : requestedLimit
  const fetchLimit = freeTier ? Math.min(effectiveLimit * 3, 30) : effectiveLimit
  const effectivePage = freeTier ? 1 : page
  const offset = (effectivePage - 1) * effectiveLimit

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

  // Embed the raw search term (not the keyword-expanded query) for semantic
  // matching. Cached in-process so repeat searches don't re-spend Gemini calls.
  // On any failure, degrade gracefully to ts_rank-only.
  let queryEmbedding: number[] | null = null
  if (searchTerm && searchTerm.length >= 3) {
    queryEmbedding = getCachedEmbedding(searchTerm)
    if (!queryEmbedding) {
      try {
        const ai = useServerGemini()
        const op = log.timedOp('embed query', { query: searchTerm })
        queryEmbedding = await embedText(ai, searchTerm)
        setCachedEmbedding(searchTerm, queryEmbedding)
        op.done({ dim: queryEmbedding.length })
      } catch (err) {
        log.warn('Query embedding failed — falling back to ts_rank only', {
          query: searchTerm,
          error: err instanceof Error ? err.message : String(err)
        })
        queryEmbedding = null
      }
    }
  }

  const { data, error } = await (supabase.rpc as any)('search_videos', {
    search_query: searchQuery,
    query_embedding: queryEmbedding,
    tag_filter: tags.length > 0 ? tags : null,
    logic_flow_filter: logicFlowId,
    result_limit: fetchLimit,
    result_offset: offset
  }) as { data: any[] | null; error: any }

  if (error) {
    log.error('Search RPC failed', new Error(error.message), { code: error.code, details: error.details })

    if (error.code === '42883' || error.message?.includes('function') || error.code === 'PGRST202') {
      log.info('Falling back to direct query (search_videos RPC not found)')
      return await fallbackBrowse(supabase, { searchTerm, keywords, tags, logicFlowId, limit: fetchLimit, offset, page: effectivePage, freeTier, effectiveLimit })
    }

    throw createError({ statusCode: 500, message: error.message })
  }

  let rows = data || []

  // Free tier: strip premium rows, then cap to effectiveLimit. Premium rows
  // aren't shown at all — no blurred/censored teaser.
  if (freeTier) {
    rows = rows.filter((r: any) => !r.is_premium).slice(0, effectiveLimit)
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
    limit: effectiveLimit,
    anon
  }
})
