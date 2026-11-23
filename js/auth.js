/**
 * Slice - Módulo de Autenticación de Usuario Único (Supabase Auth)
 */

import { LOCAL_STORAGE_KEY, USE_LOCAL_DEMO_MODE } from './config.js';
import { getSupabaseClient } from './supabaseClient.js';

const REMEMBER_ME_KEY = 'slice_remember_me';
const SAVED_EMAIL_KEY = 'slice_saved_email';

const LOCAL_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'angel@slice.local'
};

export function getRememberedAuthPrefs() {
  try {
    const rawRemember = localStorage.getItem(REMEMBER_ME_KEY);
    const rememberMe = rawRemember === null ? true : rawRemember === 'true';
    const rawEmail = localStorage.getItem(SAVED_EMAIL_KEY);
    const savedEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
    return { rememberMe, savedEmail };
  } catch (_e) {
    return { rememberMe: true, savedEmail: '' };
  }
}

export function saveRememberedAuthPrefs(rememberMe, email) {
  try {
    if (rememberMe) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      localStorage.setItem(REMEMBER_ME_KEY, 'true');
      if (normalizedEmail) {
        localStorage.setItem(SAVED_EMAIL_KEY, normalizedEmail);
      }
    } else {
      localStorage.setItem(REMEMBER_ME_KEY, 'false');
      localStorage.removeItem(SAVED_EMAIL_KEY);
    }
  } catch (_e) {}
}

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
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (USE_LOCAL_DEMO_MODE) {
    return { user: LOCAL_USER, error: null };
  }
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: String(password || '')
  });
  return { user: data?.user ?? null, error };
}

export async function signOut() {
  try {
    // Limpiar caché de datos financieros pero conservar slice_saved_email y slice_remember_me si estaba activo
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    const { rememberMe } = getRememberedAuthPrefs();
    if (!rememberMe) {
      localStorage.removeItem(SAVED_EMAIL_KEY);
    }
  } catch (_e) {}

  if (USE_LOCAL_DEMO_MODE) {
    return;
  }
  const supabase = await getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}
