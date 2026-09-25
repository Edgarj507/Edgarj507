import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser client. Only the project URL and the *anon* key reach the bundle — both are public by
 * design; every table is protected by RLS. The service-role key lives only in edge-function
 * secrets (see scripts/check-secrets.mjs, which fails the build if one leaks into dist/).
 *
 * Session handling:
 *  - PKCE flow: OAuth codes are exchanged in-app, so tokens never appear in the URL fragment.
 *  - Tokens are kept in sessionStorage (tab-scoped, cleared on close) rather than localStorage,
 *    shrinking the window an XSS bug could exploit. A strict CSP (vite.config.ts) is the primary
 *    XSS control. HTTP-only cookies need a server we control on the same site; for the native
 *    Capacitor build, swap `storage` for a Keychain/Keystore-backed adapter.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const tabStorage = {
  getItem: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  setItem: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* blocked */ } },
  removeItem: (k: string) => { try { sessionStorage.removeItem(k); } catch { /* blocked */ } },
};

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { flowType: 'pkce', storage: tabStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const isCloudConfigured = supabase !== null;
