import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false }
      })
    : null

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  })
}
