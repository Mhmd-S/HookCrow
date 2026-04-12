import type { LockedRecipe, LockedReason } from '~/types'

// Keep this in sync with ANON_TEASER_LIMIT in server/api/browse.get.ts.
const ANON_TEASER_LIMIT = 6

function buildOverviewTeaser(skeletal: unknown): string | null {
  if (!skeletal || typeof skeletal !== 'object') return null
  const overview = (skeletal as { overview?: unknown }).overview
  if (typeof overview !== 'string') return null
  const firstSentence = overview.split(/(?<=[.!?])\s/)[0] ?? overview
  return firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence
}

function toLocked(
  data: {
    id: string
    title: string | null
    description: string | null
    creator_handle: string | null
    platform: string | null
    video_path: string
    duration_seconds: number | null
    semantic_tags: string[] | null
    skeletal_logic: unknown
  },
  reason: LockedReason
): LockedRecipe {
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    creator_handle: data.creator_handle,
    platform: data.platform,
    video_path: data.video_path,
    duration_seconds: data.duration_seconds,
    semantic_tags: data.semantic_tags,
    overview_teaser: buildOverviewTeaser(data.skeletal_logic),
    locked: true,
    reason
  }
}

async function isInAnonTeaser(
  supabase: ReturnType<typeof useServerSupabase>,
  videoId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('videos')
    .select('id')
    .eq('is_published', true)
    .eq('is_premium', false)
    .eq('status', 'complete')
    .order('updated_at', { ascending: false })
    .limit(ANON_TEASER_LIMIT)

  return (data || []).some(row => row.id === videoId)
}

export default defineEventHandler(async (event) => {
  const user = await getServerUser(event)
  const id = validateUUID(getRouterParam(event, 'id'))
  const supabase = useServerSupabase()

  const { data, error } = await supabase
    .from('videos')
    .select('*, logic_flow:logic_flows(*), segments(*)')
    .eq('id', id)
    .order('segment_order', { referencedTable: 'segments' })
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, message: 'Recipe not found' })
  }

  const isAdmin = user?.role === 'admin'

  // Drafts: admin-only.
  if (!data.is_published && !isAdmin) {
    throw createError({ statusCode: 404, message: 'Recipe not found' })
  }

  // Admins see everything.
  if (isAdmin) return { data }

  // Premium recipes require Pro regardless of auth state.
  if (data.is_premium) {
    if (!user || !canViewFullRecipe(user, data)) {
      return { data: toLocked(data, 'premium') }
    }
    return { data }
  }

  // Free recipe: authenticated users always get full detail.
  if (user) return { data }

  // Anonymous visitors get full detail only for the teaser set.
  if (await isInAnonTeaser(supabase, data.id)) {
    return { data }
  }

  return { data: toLocked(data, 'login_required') }
})
