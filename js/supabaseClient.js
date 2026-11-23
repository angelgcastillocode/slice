/**
 * Slice - Inicializador del Cliente de Supabase (@supabase/supabase-js v2 ESM)
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL, USE_LOCAL_DEMO_MODE } from './config.js';

let supabaseInstance = null;

export async function getSupabaseClient() {
  if (USE_LOCAL_DEMO_MODE || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (supabaseInstance) {
    return supabaseInstance;
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'slice_supabase_auth_token'
    }
  });
  return supabaseInstance;
}
