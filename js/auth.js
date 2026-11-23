/**
 * Slice - Módulo de Autenticación de Usuario Único (Supabase Auth)
 */

import { LOCAL_STORAGE_KEY, USE_LOCAL_DEMO_MODE } from './config.js';
import { getSupabaseClient } from './supabaseClient.js';

const LOCAL_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'angel@slice.local'
};

export async function initAuth(onAuthenticated, onSignedOut) {
  if (USE_LOCAL_DEMO_MODE) {
    onAuthenticated(LOCAL_USER);
    return;
  }

  const supabase = await getSupabaseClient();
  if (!supabase) {
    onSignedOut();
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (!error && data?.session?.user) {
    onAuthenticated(data.session.user);
  } else {
    onSignedOut();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (session?.user) {
        onAuthenticated(session.user);
      }
    } else if (event === 'SIGNED_OUT') {
      onSignedOut();
    }
  });
}

export async function signInWithPassword(email, password) {
  if (USE_LOCAL_DEMO_MODE) {
    return { user: LOCAL_USER, error: null };
  }
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim(),
    password: String(password || '')
  });
  return { user: data?.user ?? null, error };
}

export async function signOut() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (_e) {}

  if (USE_LOCAL_DEMO_MODE) {
    return;
  }
  const supabase = await getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}
