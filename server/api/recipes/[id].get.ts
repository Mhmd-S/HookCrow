import type { LockedRecipe, LockedReason } from '~/types'

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

  // Free recipe: open to anyone, including anonymous visitors. Bookmarks and
  // other account-only actions are still gated client-side.
  return { data }
})
