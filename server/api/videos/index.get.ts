import { VIDEO_STATUSES, PLATFORMS } from '~/types'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const supabase = useServerSupabase()

  let dbQuery = supabase
    .from('videos')
    .select(`
      *,
      logic_flow:logic_flows(*)
    `)

  // Filter by status
  if (query.status && typeof query.status === 'string') {
    if (VIDEO_STATUSES.includes(query.status as 'draft' | 'complete')) {
      dbQuery = dbQuery.eq('status', query.status)
    }
  }

  // Filter by platform
  if (query.platform && typeof query.platform === 'string') {
    if (PLATFORMS.includes(query.platform as 'TikTok' | 'Instagram' | 'YouTube Shorts')) {
      dbQuery = dbQuery.eq('platform', query.platform)
    }
  }

  // Filter by logic_flow_id
  if (query.logic_flow_id && typeof query.logic_flow_id === 'string') {
    dbQuery = dbQuery.eq('logic_flow_id', query.logic_flow_id)
  }

  // Search by creator_handle
  if (query.search && typeof query.search === 'string') {
    const searchTerm = query.search.trim()
    if (searchTerm.length > 0) {
      dbQuery = dbQuery.ilike('creator_handle', `%${searchTerm}%`)
    }
  }

  // Order by updated_at (most recent first)
  dbQuery = dbQuery.order('updated_at', { ascending: false })

  const { data, error } = await dbQuery

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  return { data }
})
