import type { H3Event } from 'h3'
import type { SubscriptionStatus, UserRole } from '~/types'

export interface ServerUser {
  id: string
  role: UserRole
  subscriptionStatus: SubscriptionStatus
}

/**
 * Extract and verify the authenticated user from the request.
 * Returns null if no valid auth token is present.
 */
export async function getServerUser(event: H3Event): Promise<ServerUser | null> {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const supabase = useServerSupabase()

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, subscription_status')
    .eq('id', user.id)
    .single()

  return {
    id: user.id,
    role: (profile?.role as UserRole) || 'user',
    subscriptionStatus: (profile?.subscription_status as SubscriptionStatus) || 'free'
  }
}

export async function requireAuth(event: H3Event): Promise<ServerUser> {
  const user = await getServerUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }
  return user
}

export async function requireAdmin(event: H3Event): Promise<ServerUser> {
  const user = await requireAuth(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Admin access required' })
  }
  return user
}
