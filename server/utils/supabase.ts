import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database'

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

export function useServerSupabase() {
  if (!supabaseClient) {
    const config = useRuntimeConfig()
    supabaseClient = createClient<Database>(
      config.public.supabaseUrl as string,
      config.public.supabaseKey as string
    )
  }
  return supabaseClient
}
