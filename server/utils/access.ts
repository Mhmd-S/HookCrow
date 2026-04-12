import type { ServerUser } from './auth'

export function userHasPro(user: ServerUser | null): boolean {
  return !!user && user.subscriptionStatus === 'active'
}

export function canViewFullRecipe(
  user: ServerUser | null,
  video: { is_premium: boolean | null }
): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (!video.is_premium) return true
  return userHasPro(user)
}
