import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database'

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

function getServiceRoleConfig() {
  const config = useRuntimeConfig()
  const serviceRoleKey = config.supabaseServiceRoleKey as string
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — server API requires the service role key')
  }
  return { url: config.public.supabaseUrl as string, key: serviceRoleKey }
}

export function useServerSupabase() {
  if (!supabaseClient) {
    const { url, key } = getServiceRoleConfig()
    supabaseClient = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  }
  return supabaseClient
}

// Use for auth operations like signInWithPassword that mutate the client's
// in-memory session — calling them on the shared singleton would leak the
// signed-in user's JWT into all subsequent service-role requests.
export function createServerSupabase() {
  const { url, key } = getServiceRoleConfig()
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
}
