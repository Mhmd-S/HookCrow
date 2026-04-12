import type { UserRole } from '~/types'

const ROLES = ['admin', 'user'] as const

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = validateUUID(getRouterParam(event, 'id'), 'user id')
  const body = await readBody<{ role: UserRole }>(event)
  const role = validateEnum(body?.role, 'role', ROLES)

  // Prevent an admin from demoting themselves and removing the last admin seat by accident.
  if (admin.id === id && role !== 'admin') {
    throw createError({ statusCode: 400, message: 'You cannot demote yourself' })
  }

  const supabase = useServerSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', id)
    .select('id, email, display_name, role, created_at, updated_at')
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  return { data }
})
