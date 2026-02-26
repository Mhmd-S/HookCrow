import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database'

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

export function useServerSupabase() {
  if (!supabaseClient) {
    const config = useRuntimeConfig()
    const serviceRoleKey = config.supabaseServiceRoleKey as string
    console.log('Initializing Supabase client with service role key')
    if (!serviceRoleKey) {
      console.log('SUPABASE_SERVICE_ROLE_KEY is not set in runtime config')
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — server API requires the service role key')
    }
    supabaseClient = createClient<Database>(
      config.supabaseUrl as string,
      serviceRoleKey
    )
  }
  return supabaseClient
}
