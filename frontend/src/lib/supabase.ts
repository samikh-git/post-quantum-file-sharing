import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

export const isSupabaseConfigured = Boolean(url && anon)

/**
 * `createClient('', '')` throws ("supabaseUrl is required"). Use syntactically valid
 * placeholders when env is missing; we never call real auth until configured.
 */
const PLACEHOLDER_URL = 'https://local-dev.invalid.supabase.co'
const PLACEHOLDER_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.invalid'

if (!isSupabaseConfigured) {
  console.warn(
    '[pqfs] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — auth disabled until set.'
  )
}

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url : PLACEHOLDER_URL,
  isSupabaseConfigured ? anon : PLACEHOLDER_ANON,
  {
    auth: {
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: isSupabaseConfigured,
    },
  }
)
