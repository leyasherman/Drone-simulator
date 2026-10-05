import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client, or null when the env vars are missing (tests, or a build without a backend).
 * The game always works without it; progress then stays in the browser only.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/**
 * Makes sure there is a signed-in user: reuses the saved session, or signs in anonymously (no form).
 * Returns the user id, or null when offline or the backend is unavailable.
 */
export async function ensureSession(client: SupabaseClient | null = supabase): Promise<string | null> {
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: anon, error } = await client.auth.signInAnonymously();
    if (error) {
      console.warn('Anonymous sign-in failed:', error.message);
      return null;
    }
    return anon.user?.id ?? null;
  } catch (e) {
    console.warn('Supabase unavailable:', e);
    return null;
  }
}
